# routers/people_ops.py - People Operations / RRHH Routes
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone, timedelta
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
        "name_en": data.name_en or None,
        "name_es": data.name_es or None,
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
    if data.name_en is not None:
        update_doc["name_en"] = data.name_en or None
    if data.name_es is not None:
        update_doc["name_es"] = data.name_es or None
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

    # Enrich departments with their employees (independent of position)
    pos_dept = {p["position_id"]: p.get("department_id") for p in positions}
    dept_employees: dict = {}
    for emp in employees:
        dept_id = emp.get("department_id") or pos_dept.get(emp.get("position_id"))
        if dept_id:
            dept_employees.setdefault(dept_id, []).append(emp)
    dept_positions: dict = {}
    for p in positions:
        did = p.get("department_id")
        if did:
            dept_positions.setdefault(did, []).append(p)
    for dept in departments:
        did = dept["department_id"]
        dept["employees"] = dept_employees.get(did, [])
        dept["employee_count"] = len(dept["employees"])
        dept["position_count"] = len(dept_positions.get(did, []))

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


@people_ops_router.post("/employees/migrate-currency")
async def migrate_employee_currency(user: User = Depends(get_current_user)):
    """One-shot migration: replace currency 'USD' (default placeholder) on employees with
    the company's currency from Settings → General. Idempotent: a no-op when company.currency==USD."""
    company_id, _ = await check_people_ops_access(user, "edit")
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "currency": 1})
    target = (company or {}).get("currency") or "USD"
    if target.upper() == "USD":
        return {"updated": 0, "target_currency": target, "message": "Company currency is USD; nothing to migrate."}
    res = await db.employees.update_many(
        {"company_id": company_id, "$or": [{"currency": "USD"}, {"currency": {"$exists": False}}, {"currency": None}]},
        {"$set": {"currency": target}}
    )
    return {"updated": res.modified_count, "target_currency": target}


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
    
    # Resolve default currency from company settings (Settings → General)
    company_currency = None
    if not data.currency:
        company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "currency": 1})
        company_currency = (company or {}).get("currency") or "USD"
    resolved_currency = data.currency or company_currency
    
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
        "base_salary_basis": data.base_salary_basis or "monthly",
        "payment_frequency": data.payment_frequency.value,
        "currency": resolved_currency,
        "bank_name": data.bank_name,
        "bank_account": data.bank_account,
        "bank_account_type": data.bank_account_type,
        
        # Benefits
        "has_health_insurance": data.has_health_insurance,
        "has_pension": data.has_pension,
        "has_isr": data.has_isr if hasattr(data, 'has_isr') and data.has_isr is not None else True,
        "afp_provider": data.afp_provider,
        "ars_provider": data.ars_provider,
        
        # Vacation (calculated by tenure - RD Labor Code Art. 177)
        # <6 months = 0, 6mo-<5yr = 14 days, 5+ years = 18 days
        "vacation_days_entitled": calculate_vacation_entitled(data.hire_date),
        "vacation_days_used": 0.0,
        "vacation_days_available": calculate_vacation_entitled(data.hire_date),
        "vacation_manual_override": False,
        
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
    
    # Use exclude_unset to honor explicit nulls (e.g. clearing afp_override)
    raw = data.dict(exclude_unset=True)
    clearable_fields = {"afp_override", "ars_override", "isr_override"}
    update_data = {k: v for k, v in raw.items() if v is not None or k in clearable_fields}
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
    
    # Detect salary change to auto-record history (audit trail)
    salary_history_entry = None
    if "base_salary" in update_data:
        current_emp = await db.employees.find_one(
            {"employee_id": employee_id, "company_id": company_id},
            {"_id": 0, "full_name": 1, "base_salary": 1}
        )
        if current_emp:
            prev_salary = float(current_emp.get("base_salary") or 0)
            new_salary = float(update_data.get("base_salary") or 0)
            if abs(prev_salary - new_salary) > 0.01:
                now = datetime.now(timezone.utc)
                change_pct = ((new_salary - prev_salary) / prev_salary * 100) if prev_salary > 0 else 0
                salary_history_entry = {
                    "change_id": f"sc_{uuid.uuid4().hex[:12]}",
                    "company_id": company_id,
                    "employee_id": employee_id,
                    "employee_name": current_emp.get("full_name"),
                    "previous_salary": prev_salary,
                    "new_salary": new_salary,
                    "change_percentage": round(change_pct, 2),
                    "effective_date": now.date().isoformat(),
                    "reason": "adjustment",
                    "notes": "Auto-recorded via employee profile update",
                    "approved_by": user.user_id if access_level == "admin" else None,
                    "approved_at": now.isoformat() if access_level == "admin" else None,
                    "created_at": now.isoformat()
                }
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.employees.update_one(
        {"employee_id": employee_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Insert salary change record after successful employee update
    if salary_history_entry:
        await db.salary_changes.insert_one(salary_history_entry)
    
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
    
    # Total monthly payroll (if admin/hr) — base_salary is stored as monthly amount
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
    
    # Derive previous_salary from DB if client did not send one (avoids tampering)
    prev_salary = data.previous_salary
    if prev_salary is None:
        prev_salary = float(employee.get("base_salary") or 0)
    
    change_percentage = ((data.new_salary - prev_salary) / prev_salary * 100) if prev_salary > 0 else 0
    
    change_doc = {
        "change_id": change_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "previous_salary": prev_salary,
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
    
    change_doc.pop("_id", None)
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
      - "salary_only": pays only base salary + legal deductions (no OT, no bonus, no incentives)
    """
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    period_id = f"period_{uuid.uuid4().hex[:12]}"
    payment_kind = (data.payment_kind or "regular").lower()
    if payment_kind not in ("regular", "overtime_only", "salary_only"):
        raise HTTPException(status_code=400, detail="payment_kind must be 'regular', 'overtime_only' or 'salary_only'")
    
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
                if payment_kind == "overtime_only":
                    prefix = "Horas Extras"
                elif payment_kind == "salary_only":
                    prefix = "Solo Salario"
                else:
                    prefix = "Quincena"
                period_name = f"{prefix} {half} - {month_name} {year}"
            elif data.period_type == PaymentFrequency.MONTHLY:
                if payment_kind == "overtime_only":
                    prefix = "Horas Extras"
                elif payment_kind == "salary_only":
                    prefix = "Solo Salario"
                else:
                    prefix = "Nómina"
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
    
    include_ot = data.auto_include_overtime and payment_kind != "salary_only"
    ot_by_employee: dict = {}
    ot_period_ids_by_employee: dict = {}
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

        # NEW: also include period-based approved OT overlapping the pay period date range
        ot_period_query = {
            "company_id": company_id,
            "status": "approved",
            "$or": [{"payroll_period_id": None}, {"payroll_period_id": {"$exists": False}}],
            "start_date": {"$lte": data.end_date},
            "end_date": {"$gte": data.start_date},
        }
        ot_periods = await db.overtime_period_requests.find(ot_period_query, {"_id": 0}).to_list(500)
        for otp in ot_periods:
            emp_id = otp.get("employee_id")
            if not emp_id:
                continue
            # Prefer effective (shortfall-adjusted) totals
            eff_totals = otp.get("effective_totals") or otp.get("totals") or {}
            acc = ot_by_employee.setdefault(emp_id, {"hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0, "ot_ids": []})
            acc["hours_35"] += float(eff_totals.get("hours_35") or 0)
            acc["hours_night"] += float(eff_totals.get("hours_night") or 0)
            acc["hours_holiday"] += float(eff_totals.get("hours_holiday") or 0)
            acc["hours_100"] += float(eff_totals.get("hours_100") or 0)
            # Track period IDs separately so we can mark them consumed after pay run
            ot_period_ids_by_employee.setdefault(emp_id, []).append(otp.get("overtime_period_id"))
    
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
    consumed_pending_ids: list = []  # pending_deductions to mark as 'applied'
    
    for emp in employees:
        base_salary = float(emp.get("base_salary") or 0)
        freq = emp.get("payment_frequency", "biweekly")
        
        # period_salary = how much salary this employee gets for this period
        if payment_kind == "overtime_only":
            period_salary = 0.0
        else:
            # base_salary is ALWAYS the MONTHLY amount. Derive period_salary from period_type.
            monthly_equivalent = base_salary
            if data.period_type.value == "biweekly":
                period_salary = monthly_equivalent / 2
            elif data.period_type.value == "weekly":
                period_salary = monthly_equivalent / 4.33
            else:  # monthly
                period_salary = monthly_equivalent
        
        # Hourly rate derived from MONTHLY salary equivalent
        monthly_salary_eq = base_salary if freq == "monthly" else (base_salary * 2 if freq == "biweekly" else base_salary * 4)
        hourly_rate = (monthly_salary_eq / hours_per_month) if hours_per_month else 0
        
        # Pull OT for this employee
        ot_data = ot_by_employee.get(emp.get("employee_id"), {"hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0, "ot_ids": []})
        ot_period_ids_emp = ot_period_ids_by_employee.get(emp.get("employee_id"), [])
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
            # Check for per-employee manual OVERRIDES (monthly amounts; auto-divide for biweekly)
            is_biweekly_period = data.period_type.value == "biweekly"
            divisor = 2 if is_biweekly_period else 1
            
            # Per-employee toggles (default True for backward compatibility)
            emp_has_afp = emp.get("has_pension", True) is not False
            emp_has_ars = emp.get("has_health_insurance", True) is not False
            emp_has_isr = emp.get("has_isr", True) is not False
            
            afp_override = emp.get("afp_override")
            if not emp_has_afp:
                afp_emp = 0.0
            elif afp_override is not None and afp_override > 0:
                afp_emp = float(afp_override) / divisor
            else:
                afp_emp = period_salary * (config.get("afp_employee_rate", 2.87) / 100)
            
            ars_override = emp.get("ars_override")
            if not emp_has_ars:
                ars_emp = 0.0
            elif ars_override is not None and ars_override > 0:
                ars_emp = float(ars_override) / divisor
            else:
                ars_emp = period_salary * (config.get("ars_employee_rate", 3.04) / 100)
            
            isr_override = emp.get("isr_override")
            if not emp_has_isr:
                period_isr = 0.0
            elif isr_override is not None and isr_override > 0:
                period_isr = float(isr_override) / divisor
            else:
                # ISR is monthly progressive; compute from monthly_equivalent (already in monthly basis)
                monthly_isr = calculate_monthly_isr(monthly_equivalent) if config.get("isr_enabled", True) else 0
                period_isr = monthly_isr / 2 if is_biweekly_period else monthly_isr
            
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
        
        # Consume pending one-off deductions queued for this employee (skip for overtime_only)
        consumed_pending = []
        pending_total = 0.0
        if payment_kind != "overtime_only":
            pending_list = await db.pending_deductions.find({
                "company_id": company_id,
                "employee_id": emp.get("employee_id"),
                "status": "pending"
            }, {"_id": 0}).sort("created_at", 1).to_list(50)
            for pd in pending_list:
                amt = float(pd.get("amount") or 0)
                if amt <= 0:
                    continue
                consumed_pending.append({
                    "id": pd.get("deduction_id"),
                    "reason": pd.get("reason") or "Descuento programado",
                    "amount": round(amt, 2),
                    "source": "pending_deduction"
                })
                pending_total += amt
                consumed_pending_ids.append(pd.get("deduction_id"))
        
        total_emp_deductions = afp_emp + ars_emp + period_isr + loan_deduction + pending_total
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
            "extra_deductions": consumed_pending,
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
            "linked_overtime_period_ids": ot_period_ids_emp,
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

    # Link the consumed OT PERIOD requests (new periodic overtime collection)
    consumed_ot_period_ids = [pid for ids in ot_period_ids_by_employee.values() for pid in ids if pid]
    if consumed_ot_period_ids:
        await db.overtime_period_requests.update_many(
            {"company_id": company_id, "overtime_period_id": {"$in": consumed_ot_period_ids}},
            {"$set": {"payroll_period_id": period_id, "status": "processed", "updated_at": now.isoformat()}}
        )
    
    # Mark consumed pending deductions as applied
    if consumed_pending_ids:
        await db.pending_deductions.update_many(
            {"company_id": company_id, "deduction_id": {"$in": consumed_pending_ids}},
            {"$set": {
                "status": "applied",
                "applied_to_period_id": period_id,
                "applied_at": now.isoformat()
            }}
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


@people_ops_router.delete("/payroll/periods/{period_id}")
async def delete_payroll_period(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a payroll period (only allowed for draft/pending_approval/cancelled).
    
    Releases any linked overtime requests back to 'approved' so they can be re-included
    in another period.
    """
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0, "status": 1}
    )
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    
    status_value = (period.get("status") or "").lower()
    if status_value not in ("draft", "pending_approval", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete payroll in status '{status_value}'. Only draft, pending_approval or cancelled periods can be deleted."
        )
    
    # Release linked OTs back to 'approved' and remove the payroll_period_id link
    await db.overtime_requests.update_many(
        {"company_id": company_id, "payroll_period_id": period_id},
        {"$set": {"payroll_period_id": None, "status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    # Also release periodic OT
    await db.overtime_period_requests.update_many(
        {"company_id": company_id, "payroll_period_id": period_id},
        {"$set": {"payroll_period_id": None, "status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Revert any pending_deductions that were consumed by this period back to 'pending'
    await db.pending_deductions.update_many(
        {"company_id": company_id, "applied_to_period_id": period_id},
        {"$set": {"status": "pending", "applied_to_period_id": None, "applied_at": None}}
    )
    
    # Delete all entries
    entries_result = await db.payroll_entries.delete_many(
        {"period_id": period_id, "company_id": company_id}
    )
    
    # Delete the period itself
    await db.payroll_periods.delete_one(
        {"period_id": period_id, "company_id": company_id}
    )
    
    return {
        "success": True,
        "period_id": period_id,
        "entries_deleted": entries_result.deleted_count
    }


# ==================== PENDING DEDUCTIONS ====================
# One-off discounts queued to be consumed by the next regular payroll period
# (e.g. "Reembolso uniforme RD$500" — applies once, then status=applied)

from pydantic import BaseModel as _BaseModelPD


class PendingDeductionCreate(_BaseModelPD):
    employee_id: str
    amount: float
    reason: str  # short label e.g. "Reembolso uniforme"
    notes: Optional[str] = None


@people_ops_router.get("/pending-deductions")
async def list_pending_deductions(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List pending deductions. Optional filters by employee_id and status (pending|applied|cancelled)."""
    company_id, _ = await check_people_ops_access(user, "view")
    query: dict = {"company_id": company_id}
    if employee_id:
        query["employee_id"] = employee_id
    if status:
        query["status"] = status
    items = await db.pending_deductions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@people_ops_router.post("/pending-deductions")
async def create_pending_deduction(
    data: PendingDeductionCreate,
    user: User = Depends(get_current_user)
):
    """Create a one-off deduction that will be auto-consumed by the next payroll period."""
    company_id, _ = await check_people_ops_access(user, "edit")
    
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than 0")
    
    emp = await db.employees.find_one(
        {"employee_id": data.employee_id, "company_id": company_id},
        {"_id": 0, "full_name": 1, "employee_number": 1}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    now = datetime.now(timezone.utc)
    deduction_id = f"pd_{uuid.uuid4().hex[:12]}"
    doc = {
        "deduction_id": deduction_id,
        "company_id": company_id,
        "employee_id": data.employee_id,
        "employee_name": emp.get("full_name"),
        "employee_number": emp.get("employee_number"),
        "amount": round(float(data.amount), 2),
        "reason": data.reason,
        "notes": data.notes,
        "status": "pending",
        "applied_to_period_id": None,
        "applied_at": None,
        "created_by": user.user_id,
        "created_at": now.isoformat()
    }
    await db.pending_deductions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@people_ops_router.delete("/pending-deductions/{deduction_id}")
async def delete_pending_deduction(
    deduction_id: str,
    user: User = Depends(get_current_user)
):
    """Cancel/delete a pending deduction. Only allowed if status='pending'."""
    company_id, _ = await check_people_ops_access(user, "edit")
    
    pd = await db.pending_deductions.find_one(
        {"deduction_id": deduction_id, "company_id": company_id},
        {"_id": 0, "status": 1}
    )
    if not pd:
        raise HTTPException(status_code=404, detail="Pending deduction not found")
    if pd.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete deduction in status '{pd.get('status')}'. Only pending deductions can be deleted."
        )
    
    await db.pending_deductions.delete_one(
        {"deduction_id": deduction_id, "company_id": company_id}
    )
    return {"success": True, "deduction_id": deduction_id}


# ==================== PAYROLL PROJECTION (Next Run Dashboard) ====================

@people_ops_router.get("/payroll/projection")
async def payroll_projection(
    period_type: str = "biweekly",
    user: User = Depends(get_current_user)
):
    """Estimate the cost of the NEXT payroll run given:
    - all currently active employees
    - all pending_deductions (status=pending) for those employees
    - all approved overtime not yet linked to a paid period (status=approved, payroll_period_id is null/missing)
    - active loan installments
    - AFP/ARS/ISR computed from base_salary (honoring overrides)
    
    For biweekly type, monthly base_salary is divided by 2 (and ISR/overrides too).
    """
    company_id, _ = await check_people_ops_access(user, "view")
    
    if period_type not in ("biweekly", "monthly", "weekly"):
        period_type = "biweekly"
    
    # Load active employees + payroll config in parallel
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0}
    ).to_list(2000)
    
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0}) or {}
    afp_rate = config.get("afp_employee_rate", 2.87) / 100
    ars_rate = config.get("ars_employee_rate", 3.04) / 100
    isr_enabled = config.get("isr_enabled", True)
    
    is_biweekly = period_type == "biweekly"
    divisor = 2 if is_biweekly else 1
    
    # Aggregate metrics
    total_gross = 0.0
    total_afp = 0.0
    total_ars = 0.0
    total_isr = 0.0
    total_loan = 0.0
    total_pending_ded = 0.0
    overrides_in_use = 0
    
    employee_breakdown = []
    
    for emp in employees:
        emp_id = emp.get("employee_id")
        base_salary = float(emp.get("base_salary") or 0)
        freq = emp.get("payment_frequency", "monthly")
        
        # base_salary is ALWAYS the MONTHLY amount. Derive period_salary from period_type.
        monthly_equiv = base_salary
        if is_biweekly:
            period_salary = monthly_equiv / 2
        elif period_type == "weekly":
            period_salary = monthly_equiv / 4.33
        else:
            period_salary = monthly_equiv
        
        # Per-employee benefit toggles
        emp_has_afp = emp.get("has_pension", True) is not False
        emp_has_ars = emp.get("has_health_insurance", True) is not False
        emp_has_isr = emp.get("has_isr", True) is not False
        
        # AFP
        afp_override = emp.get("afp_override")
        if not emp_has_afp:
            afp = 0.0
        elif afp_override and afp_override > 0:
            afp = float(afp_override) / divisor
            overrides_in_use += 1
        else:
            afp = period_salary * afp_rate
        
        # ARS
        ars_override = emp.get("ars_override")
        if not emp_has_ars:
            ars = 0.0
        elif ars_override and ars_override > 0:
            ars = float(ars_override) / divisor
        else:
            ars = period_salary * ars_rate
        
        # ISR
        isr_override = emp.get("isr_override")
        if not emp_has_isr:
            isr = 0.0
        elif isr_override and isr_override > 0:
            isr = float(isr_override) / divisor
        elif isr_enabled:
            monthly_isr = calculate_monthly_isr(monthly_equiv)
            isr = monthly_isr / 2 if is_biweekly else monthly_isr
        else:
            isr = 0.0
        
        # Loans
        loan_amt = 0.0
        if emp.get("active_loan_balance", 0) > 0:
            active_loan = await db.loans.find_one(
                {"company_id": company_id, "employee_id": emp_id, "status": "active"},
                {"_id": 0, "installment_amount": 1, "remaining_balance": 1}
            )
            if active_loan:
                loan_amt = min(active_loan.get("installment_amount", 0), active_loan.get("remaining_balance", 0))
        
        total_gross += period_salary
        total_afp += afp
        total_ars += ars
        total_isr += isr
        total_loan += loan_amt
        
        employee_breakdown.append({
            "employee_id": emp_id,
            "employee_name": emp.get("full_name"),
            "period_salary": round(period_salary, 2),
            "afp": round(afp, 2),
            "ars": round(ars, 2),
            "isr": round(isr, 2),
            "loan": round(loan_amt, 2),
            "has_override": bool((afp_override and afp_override > 0) or (ars_override and ars_override > 0) or (isr_override and isr_override > 0))
        })
    
    # Pending deductions across all active employees
    active_ids = [e.get("employee_id") for e in employees]
    pending_ded_docs = await db.pending_deductions.find(
        {"company_id": company_id, "employee_id": {"$in": active_ids}, "status": "pending"},
        {"_id": 0, "employee_id": 1, "employee_name": 1, "amount": 1, "reason": 1, "notes": 1, "deduction_id": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(200)
    
    pending_ded_by_emp: dict = {}
    for pd in pending_ded_docs:
        amt = float(pd.get("amount") or 0)
        total_pending_ded += amt
        pending_ded_by_emp.setdefault(pd["employee_id"], 0)
        pending_ded_by_emp[pd["employee_id"]] += amt
    
    # Attach pending_ded total per-employee in breakdown
    for row in employee_breakdown:
        row["pending_deductions"] = round(pending_ded_by_emp.get(row["employee_id"], 0), 2)
    
    # Approved (unpaid) overtime — legacy per-day requests
    ot_query = {
        "company_id": company_id,
        "employee_id": {"$in": active_ids},
        "status": "approved",
        "$or": [{"payroll_period_id": None}, {"payroll_period_id": {"$exists": False}}]
    }
    pending_ot = await db.overtime_requests.find(ot_query, {"_id": 0}).to_list(500)

    ot_hours = 0.0
    ot_amount = 0.0
    for ot in pending_ot:
        ot_hours += float(ot.get("hours") or 0)
        ot_amount += float(ot.get("amount") or 0)

    # NEW: Approved (unpaid) overtime PERIODS — use employee override or company default
    # to decide which amount to include (bonus-only vs full)
    payroll_cfg = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0, "overtime_payment_mode": 1}) or {}
    company_mode = payroll_cfg.get("overtime_payment_mode") or "integrated"
    employees_map = {e["employee_id"]: e for e in employees}
    pending_ot_periods = await db.overtime_period_requests.find(
        {
            "company_id": company_id,
            "employee_id": {"$in": active_ids},
            "status": "approved",
            "$or": [{"payroll_period_id": None}, {"payroll_period_id": {"$exists": False}}],
        },
        {"_id": 0},
    ).to_list(500)
    for otp in pending_ot_periods:
        # Prefer shortfall-adjusted (effective) amounts if present
        effective_totals = otp.get("effective_totals") or otp.get("totals") or {}
        ot_hours += float(effective_totals.get("total_hours") or 0)
        # Mode resolution: employee override → company default
        emp = employees_map.get(otp.get("employee_id")) or {}
        mode = emp.get("overtime_payment_mode") or company_mode
        if mode == "integrated":
            # Only surcharge/bonus adds to gross (base already in salary)
            amt = float(otp.get("estimated_amount_effective_extra_only") or otp.get("estimated_amount_extra_only") or 0)
        else:
            # Separate → full OT pay (base + surcharge) is additional
            amt = float(otp.get("estimated_amount_effective") or otp.get("estimated_amount") or 0)
        ot_amount += amt
    
    # Active loans summary
    active_loans = await db.loans.find(
        {"company_id": company_id, "employee_id": {"$in": active_ids}, "status": "active"},
        {"_id": 0, "installment_amount": 1, "remaining_balance": 1, "employee_id": 1}
    ).to_list(200)
    loans_summary = {
        "count": len(active_loans),
        "next_installment_total": round(sum(min(l.get("installment_amount", 0), l.get("remaining_balance", 0)) for l in active_loans), 2),
        "outstanding_balance": round(sum(l.get("remaining_balance", 0) for l in active_loans), 2)
    }
    
    estimated_legal_ded = total_afp + total_ars + total_isr
    estimated_total_ded = estimated_legal_ded + total_loan + total_pending_ded
    estimated_gross_with_ot = total_gross + ot_amount
    estimated_net = estimated_gross_with_ot - estimated_total_ded
    
    return {
        "period_type": period_type,
        "active_employees": len(employees),
        "totals": {
            "base_salary_period": round(total_gross, 2),
            "pending_overtime_amount": round(ot_amount, 2),
            "estimated_gross": round(estimated_gross_with_ot, 2),
            "afp": round(total_afp, 2),
            "ars": round(total_ars, 2),
            "isr": round(total_isr, 2),
            "legal_deductions": round(estimated_legal_ded, 2),
            "loan_deductions": round(total_loan, 2),
            "pending_deductions": round(total_pending_ded, 2),
            "total_deductions": round(estimated_total_ded, 2),
            "estimated_net": round(estimated_net, 2)
        },
        "pending_deductions": {
            "count": len(pending_ded_docs),
            "total_amount": round(total_pending_ded, 2),
            "by_employee_count": len(pending_ded_by_emp),
            "top_5": pending_ded_docs[:5]
        },
        "pending_overtime": {
            "count": len(pending_ot) + len(pending_ot_periods),
            "total_hours": round(ot_hours, 2),
            "total_amount": round(ot_amount, 2)
        },
        "loans": loans_summary,
        "overrides_in_use": overrides_in_use,
        "employee_breakdown": employee_breakdown
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



# ==================== EMPLOYEE SCHEDULES / HORARIOS ENDPOINTS ====================
# Weekly pattern per employee, versioned. New schedule auto-supersedes previous.
# Rotative/variable schedules are handled by creating multiple versions with different
# effective_from dates — e.g., temporada alta / temporada baja.

DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _empty_day() -> dict:
    return {"work_hours": 0.0, "start": None, "end": None, "break_min": 0}


def _normalize_weekly_pattern(pattern: dict) -> dict:
    """Ensure all 7 days are present and values are numeric."""
    out = {}
    for d in DAYS_OF_WEEK:
        raw = (pattern or {}).get(d) or {}
        out[d] = {
            "work_hours": float(raw.get("work_hours") or 0),
            "start": raw.get("start") or None,
            "end": raw.get("end") or None,
            "break_min": int(raw.get("break_min") or 0),
        }
    return out


def _weekly_hours_total(pattern: dict) -> float:
    return round(sum(float((pattern.get(d) or {}).get("work_hours") or 0) for d in DAYS_OF_WEEK), 2)


@people_ops_router.get("/schedules/employee/{employee_id}")
async def list_employee_schedules(employee_id: str, user: User = Depends(get_current_user)):
    """Return all schedule versions for an employee, newest first. Full audit trail."""
    company_id = user.company_id or user.active_org_id
    docs = await db.employee_schedules.find(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0},
    ).sort("effective_from", -1).to_list(200)
    return docs


@people_ops_router.get("/schedules/employee/{employee_id}/current")
async def get_current_employee_schedule(employee_id: str, user: User = Depends(get_current_user)):
    """Return the currently effective schedule (effective_from <= today AND (effective_to is None OR >= today))."""
    company_id = user.company_id or user.active_org_id
    today_iso = datetime.now(timezone.utc).date().isoformat()
    doc = await db.employee_schedules.find_one(
        {
            "company_id": company_id,
            "employee_id": employee_id,
            "status": "active",
            "effective_from": {"$lte": today_iso},
            "$or": [{"effective_to": None}, {"effective_to": {"$gte": today_iso}}],
        },
        {"_id": 0},
        sort=[("effective_from", -1)],
    )
    return doc  # may be None


@people_ops_router.post("/schedules/employee/{employee_id}")
async def create_employee_schedule(employee_id: str, data: dict, user: User = Depends(get_current_user)):
    """Create a new schedule version. Auto-closes the currently active one (effective_to = new effective_from - 1)."""
    company_id = user.company_id or user.active_org_id
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1},
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    from datetime import date as _date, timedelta as _td
    effective_from = data.get("effective_from") or datetime.now(timezone.utc).date().isoformat()
    weekly_pattern = _normalize_weekly_pattern(data.get("weekly_pattern") or {})
    weekly_threshold = float(data.get("weekly_hours_threshold") or 44)  # DR default; USA=40

    # Close previous open version(s)
    close_iso = None
    try:
        y, m, d = [int(x) for x in effective_from.split("-")]
        close_iso = (_date(y, m, d) - _td(days=1)).isoformat()
    except Exception:
        pass
    if close_iso:
        await db.employee_schedules.update_many(
            {
                "company_id": company_id,
                "employee_id": employee_id,
                "status": "active",
                "$or": [{"effective_to": None}, {"effective_to": {"$gte": effective_from}}],
            },
            {"$set": {"effective_to": close_iso, "status": "superseded", "updated_at": datetime.now(timezone.utc)}},
        )

    schedule_id = f"sch_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    doc = {
        "schedule_id": schedule_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "effective_from": effective_from,
        "effective_to": data.get("effective_to"),
        "weekly_pattern": weekly_pattern,
        "weekly_hours_total": _weekly_hours_total(weekly_pattern),
        "weekly_hours_threshold": weekly_threshold,
        "notes": data.get("notes") or None,
        "status": "active",
        "created_at": now,
        "created_by": user.user_id,
        "updated_at": now,
    }
    await db.employee_schedules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@people_ops_router.put("/schedules/{schedule_id}")
async def update_employee_schedule(schedule_id: str, data: dict, user: User = Depends(get_current_user)):
    """Edit an active schedule version (no re-versioning). Use POST for a NEW effective_from."""
    company_id = user.company_id or user.active_org_id
    existing = await db.employee_schedules.find_one(
        {"company_id": company_id, "schedule_id": schedule_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") != "active":
        raise HTTPException(status_code=400, detail="Only active schedules can be edited")

    update = {"updated_at": datetime.now(timezone.utc)}
    if "weekly_pattern" in data:
        pattern = _normalize_weekly_pattern(data["weekly_pattern"])
        update["weekly_pattern"] = pattern
        update["weekly_hours_total"] = _weekly_hours_total(pattern)
    if "weekly_hours_threshold" in data:
        update["weekly_hours_threshold"] = float(data["weekly_hours_threshold"] or 44)
    if "notes" in data:
        update["notes"] = data["notes"]
    if "effective_to" in data:
        update["effective_to"] = data["effective_to"]
    await db.employee_schedules.update_one(
        {"company_id": company_id, "schedule_id": schedule_id},
        {"$set": update},
    )
    return {"ok": True, "schedule_id": schedule_id}


@people_ops_router.delete("/schedules/{schedule_id}")
async def delete_employee_schedule(schedule_id: str, user: User = Depends(get_current_user)):
    """Delete a schedule version. Use with caution — history entry disappears from audit trail."""
    company_id = user.company_id or user.active_org_id
    result = await db.employee_schedules.delete_one(
        {"company_id": company_id, "schedule_id": schedule_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"ok": True}


@people_ops_router.get("/schedules/employee/{employee_id}/expected-hours")
async def compute_expected_hours(
    employee_id: str,
    start_date: str,
    end_date: str,
    user: User = Depends(get_current_user),
):
    """Sum expected work hours per day between start_date..end_date, using the schedule
    version(s) that were effective on each day. Returns { daily: {date: hours}, total: X, threshold_weekly: 44 }.
    Subtracts specific days-off from expected hours."""
    from datetime import date as _date, timedelta as _td
    company_id = user.company_id or user.active_org_id

    # Load all schedule versions overlapping this range
    schedules = await db.employee_schedules.find(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "effective_from": 1, "effective_to": 1, "weekly_pattern": 1, "weekly_hours_threshold": 1, "schedule_id": 1},
    ).sort("effective_from", 1).to_list(500)

    # Load days-off in range
    days_off_cursor = db.employee_days_off.find(
        {"company_id": company_id, "employee_id": employee_id, "date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0, "date": 1, "reason": 1},
    )
    days_off = {d["date"]: d for d in await days_off_cursor.to_list(500)}

    def pick_schedule(iso: str):
        for s in schedules:
            f = s.get("effective_from") or "0000-01-01"
            t = s.get("effective_to") or "9999-12-31"
            if f <= iso <= t:
                return s
        return None

    y1, m1, d1 = [int(x) for x in start_date.split("-")]
    y2, m2, d2 = [int(x) for x in end_date.split("-")]
    cur = _date(y1, m1, d1); end = _date(y2, m2, d2)
    daily = {}
    threshold = 44.0
    active_schedule_id = None
    while cur <= end:
        iso = cur.isoformat()
        s = pick_schedule(iso)
        if s:
            active_schedule_id = s.get("schedule_id")
            threshold = float(s.get("weekly_hours_threshold") or 44)
        day_name = DAYS_OF_WEEK[cur.weekday()]
        hours = 0.0
        if s:
            hours = float(((s.get("weekly_pattern") or {}).get(day_name) or {}).get("work_hours") or 0)
        # subtract if day-off
        if iso in days_off:
            hours = 0.0
        daily[iso] = round(hours, 2)
        cur = cur + _td(days=1)

    total = round(sum(daily.values()), 2)
    return {
        "employee_id": employee_id,
        "start_date": start_date,
        "end_date": end_date,
        "daily": daily,
        "total_hours": total,
        "weekly_hours_threshold": threshold,
        "schedule_id": active_schedule_id,
        "days_off_count": len(days_off),
    }


# ==================== EMPLOYEE DAYS OFF (specific dates) ====================

@people_ops_router.get("/days-off/employee/{employee_id}")
async def list_days_off(
    employee_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    company_id = user.company_id or user.active_org_id
    q = {"company_id": company_id, "employee_id": employee_id}
    if start_date and end_date:
        q["date"] = {"$gte": start_date, "$lte": end_date}
    docs = await db.employee_days_off.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return docs


@people_ops_router.post("/days-off/employee/{employee_id}")
async def create_day_off(employee_id: str, data: dict, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    employee = await db.employees.find_one({"company_id": company_id, "employee_id": employee_id}, {"_id": 0, "full_name": 1})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    date_iso = data.get("date")
    if not date_iso:
        raise HTTPException(status_code=400, detail="date required")
    # Prevent duplicates on same date
    existing = await db.employee_days_off.find_one({"company_id": company_id, "employee_id": employee_id, "date": date_iso}, {"_id": 0, "day_off_id": 1})
    if existing:
        raise HTTPException(status_code=400, detail=f"Day-off already exists for {date_iso}")
    day_off_id = f"dof_{uuid.uuid4().hex[:12]}"
    doc = {
        "day_off_id": day_off_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "date": date_iso,
        "reason": (data.get("reason") or "").strip() or None,
        "category": data.get("category") or "personal",  # personal|comp|other
        "created_at": datetime.now(timezone.utc),
        "created_by": user.user_id,
    }
    await db.employee_days_off.insert_one(doc)
    doc.pop("_id", None)
    return doc


@people_ops_router.delete("/days-off/{day_off_id}")
async def delete_day_off(day_off_id: str, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    result = await db.employee_days_off.delete_one({"company_id": company_id, "day_off_id": day_off_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Day-off not found")
    return {"ok": True}


@people_ops_router.get("/schedules/team-calendar")
async def team_calendar(
    start_date: str,
    end_date: str,
    user: User = Depends(get_current_user),
):
    """Aggregate all schedules + days-off + approved time-off + approved OT periods for the whole team.
    Returns list of events for calendar view."""
    company_id = user.company_id or user.active_org_id

    # All active employees
    employees = await db.employees.find(
        {"company_id": company_id, "status": {"$ne": "terminated"}},
        {"_id": 0, "employee_id": 1, "full_name": 1},
    ).to_list(500)
    employee_map = {e["employee_id"]: e["full_name"] for e in employees}

    events = []

    # Schedule expected hours (compact — one badge per employee/day if hours > 0)
    for emp_id in employee_map:
        exp = await compute_expected_hours(emp_id, start_date, end_date, user)
        for iso, hours in (exp.get("daily") or {}).items():
            if hours > 0:
                events.append({
                    "type": "schedule",
                    "employee_id": emp_id,
                    "employee_name": employee_map[emp_id],
                    "date": iso,
                    "hours": hours,
                })

    # Specific days off
    days_off = await db.employee_days_off.find(
        {"company_id": company_id, "date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0, "employee_id": 1, "employee_name": 1, "date": 1, "reason": 1, "category": 1},
    ).to_list(1000)
    for d in days_off:
        events.append({"type": "day_off", **d})

    # Approved time off
    time_off = await db.time_off_requests.find(
        {
            "company_id": company_id,
            "status": "approved",
            "$or": [
                {"start_date": {"$lte": end_date}, "end_date": {"$gte": start_date}},
            ],
        },
        {"_id": 0, "employee_id": 1, "employee_name": 1, "start_date": 1, "end_date": 1, "leave_type": 1},
    ).to_list(1000)
    for t in time_off:
        events.append({"type": "time_off", **t})

    # Approved overtime periods
    ot = await db.overtime_period_requests.find(
        {
            "company_id": company_id,
            "status": {"$in": ["approved", "paid"]},
            "start_date": {"$lte": end_date},
            "end_date": {"$gte": start_date},
        },
        {"_id": 0, "employee_id": 1, "employee_name": 1, "start_date": 1, "end_date": 1, "totals": 1, "overtime_period_id": 1},
    ).to_list(500)
    for o in ot:
        events.append({"type": "overtime", **o})

    return {"start_date": start_date, "end_date": end_date, "events": events, "employees": employees}




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


def calculate_vacation_entitled(hire_date, as_of_date=None):
    """Calculate vacation days per RD Labor Code Art. 177.
    - <6 months of service -> 0 days
    - 6 months to <5 years -> 14 days
    - 5+ years -> 18 days
    """
    if not hire_date:
        return 14.0
    try:
        if isinstance(hire_date, str):
            hd = datetime.strptime(hire_date[:10], "%Y-%m-%d").date()
        elif hasattr(hire_date, "date"):
            hd = hire_date.date()
        else:
            hd = hire_date
        ref = as_of_date or datetime.now(timezone.utc)
        if hasattr(ref, "date"):
            ref = ref.date()
        days = (ref - hd).days
        months = days / 30.4375
        years = days / 365.25
        if months < 6:
            return 0.0
        if years >= 5:
            return 18.0
        return 14.0
    except Exception:
        return 14.0


def _parse_date(d):
    """Parse a date string or return date object."""
    if not d:
        return None
    if isinstance(d, str):
        try:
            return datetime.strptime(d[:10], "%Y-%m-%d").date()
        except Exception:
            return None
    if hasattr(d, "date"):
        return d.date()
    return d


def compute_tenure_and_anniversary(hire_date):
    """Return (years_of_service, next_anniversary_date_iso, days_until_anniversary)."""
    hd = _parse_date(hire_date)
    if not hd:
        return 0.0, None, None
    today = datetime.now(timezone.utc).date()
    years = round((today - hd).days / 365.25, 2)
    # Next anniversary: same month/day, next occurrence >= today
    try:
        anniv = hd.replace(year=today.year)
    except ValueError:
        # Feb 29 on non-leap → Feb 28
        anniv = hd.replace(year=today.year, day=28)
    if anniv < today:
        try:
            anniv = hd.replace(year=today.year + 1)
        except ValueError:
            anniv = hd.replace(year=today.year + 1, day=28)
    days_until = (anniv - today).days
    return years, anniv.isoformat(), days_until


async def reset_employee_vacation_anniversary(employee, as_of_date=None):
    """Perform an anniversary reset for one employee:
    - carryover_in = current vacation_days_available (unlimited by policy)
    - new_entitled = calculate_vacation_entitled(hire_date)
    - new_available = carryover_in + new_entitled
    - vacation_days_used = 0
    Writes an entry to vacation_history collection.
    """
    emp_id = employee.get("employee_id")
    hire_date = employee.get("hire_date")
    current_available = float(employee.get("vacation_days_available") or 0)
    current_used = float(employee.get("vacation_days_used") or 0)
    current_entitled = float(employee.get("vacation_days_entitled") or 0)

    new_entitled = calculate_vacation_entitled(hire_date, as_of_date)
    carryover_in = round(current_available, 2)
    new_available = round(new_entitled + carryover_in, 2)
    now = datetime.now(timezone.utc)

    await db.employees.update_one(
        {"employee_id": emp_id},
        {"$set": {
            "vacation_days_entitled": new_entitled,
            "vacation_days_used": 0.0,
            "vacation_days_available": new_available,
            "vacation_manual_override": False,
            "vacation_last_reset_at": now,
            "updated_at": now
        }}
    )
    await db.vacation_history.insert_one({
        "history_id": f"vh_{uuid.uuid4().hex[:12]}",
        "company_id": employee.get("company_id"),
        "employee_id": emp_id,
        "employee_name": employee.get("full_name"),
        "reset_date": now.date().isoformat(),
        "previous_entitled": current_entitled,
        "previous_used": current_used,
        "previous_available": current_available,
        "carryover_in": carryover_in,
        "new_entitled": new_entitled,
        "new_available": new_available,
        "reason": "anniversary_reset",
        "created_at": now
    })
    return {"employee_id": emp_id, "carryover_in": carryover_in, "new_entitled": new_entitled, "new_available": new_available}


@people_ops_router.put("/employees/{employee_id}/vacation")
async def update_employee_vacation(
    employee_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Manually override vacation days for an employee.
    Body: {vacation_days_entitled?, vacation_days_available?, vacation_days_used?}
    Sets vacation_manual_override: true so future recalculations know it was manually adjusted.
    """
    company_id = user.company_id or user.active_org_id
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "vacation_days_entitled": 1, "vacation_days_used": 1, "vacation_days_available": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    update = {"vacation_manual_override": True, "updated_at": datetime.now(timezone.utc)}
    if "vacation_days_entitled" in data:
        try:
            update["vacation_days_entitled"] = max(0.0, float(data["vacation_days_entitled"]))
        except Exception:
            raise HTTPException(status_code=400, detail="vacation_days_entitled must be a number")
    if "vacation_days_used" in data:
        try:
            update["vacation_days_used"] = max(0.0, float(data["vacation_days_used"]))
        except Exception:
            raise HTTPException(status_code=400, detail="vacation_days_used must be a number")
    if "vacation_days_available" in data:
        try:
            update["vacation_days_available"] = max(0.0, float(data["vacation_days_available"]))
        except Exception:
            raise HTTPException(status_code=400, detail="vacation_days_available must be a number")

    # If entitled and used are provided but available is not, recalc available
    if "vacation_days_entitled" in update and "vacation_days_used" in update and "vacation_days_available" not in update:
        update["vacation_days_available"] = max(0.0, update["vacation_days_entitled"] - update["vacation_days_used"])

    await db.employees.update_one({"employee_id": employee_id}, {"$set": update})
    return {"success": True, "updated": {k: v for k, v in update.items() if k != "updated_at"}}


@people_ops_router.post("/employees/{employee_id}/vacation/recalculate")
async def recalculate_employee_vacation(
    employee_id: str,
    user: User = Depends(get_current_user)
):
    """Recalculate vacation days based on tenure (hire_date). Clears manual_override flag.
    Preserves vacation_days_used and adjusts available accordingly.
    """
    company_id = user.company_id or user.active_org_id
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "hire_date": 1, "vacation_days_used": 1, "full_name": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    entitled = calculate_vacation_entitled(employee.get("hire_date"))
    used = float(employee.get("vacation_days_used") or 0)
    available = max(0.0, entitled - used)

    await db.employees.update_one(
        {"employee_id": employee_id},
        {"$set": {
            "vacation_days_entitled": entitled,
            "vacation_days_available": available,
            "vacation_manual_override": False,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    return {
        "success": True,
        "vacation_days_entitled": entitled,
        "vacation_days_used": used,
        "vacation_days_available": available
    }



@people_ops_router.get("/time-off/balances")
async def get_time_off_balances(user: User = Depends(get_current_user)):
    """Get vacation/time off balances for all employees"""
    company_id = user.company_id or user.active_org_id
    
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0, "employee_id": 1, "full_name": 1, "hire_date": 1,
         "vacation_days_entitled": 1, "vacation_days_used": 1, "vacation_days_available": 1,
         "vacation_manual_override": 1, "vacation_last_reset_at": 1}
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
        years, next_anniv, days_until = compute_tenure_and_anniversary(emp.get("hire_date"))
        balances.append({
            "employee_id": emp.get("employee_id"),
            "employee_name": emp.get("full_name"),
            "year": datetime.now().year,
            "hire_date": emp.get("hire_date"),
            "years_of_service": years,
            "next_anniversary": next_anniv,
            "days_until_anniversary": days_until,
            "vacation_entitled": emp.get("vacation_days_entitled", 14),
            "vacation_used": emp.get("vacation_days_used", 0),
            "vacation_pending": pending_by_emp.get(emp.get("employee_id"), 0),
            "vacation_available": emp.get("vacation_days_available", 14),
            "manual_override": bool(emp.get("vacation_manual_override")),
            "last_reset_at": emp.get("vacation_last_reset_at")
        })
    
    return balances


@people_ops_router.post("/time-off/recalculate-all")
async def recalculate_all_vacations(user: User = Depends(get_current_user)):
    """Bulk recalculate vacation entitlement by tenure for ALL active employees.
    Skips employees with vacation_manual_override=True (to preserve manual overrides).
    """
    company_id = user.company_id or user.active_org_id
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0, "employee_id": 1, "hire_date": 1, "vacation_days_used": 1, "vacation_manual_override": 1}
    ).to_list(1000)
    updated = 0
    skipped = 0
    for emp in employees:
        if emp.get("vacation_manual_override"):
            skipped += 1
            continue
        entitled = calculate_vacation_entitled(emp.get("hire_date"))
        used = float(emp.get("vacation_days_used") or 0)
        available = max(0.0, entitled - used)
        await db.employees.update_one(
            {"employee_id": emp["employee_id"]},
            {"$set": {
                "vacation_days_entitled": entitled,
                "vacation_days_available": available,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        updated += 1
    return {"success": True, "updated": updated, "skipped_manual_override": skipped}


@people_ops_router.get("/time-off/vacation-history/{employee_id}")
async def get_vacation_history(employee_id: str, user: User = Depends(get_current_user)):
    """Get vacation reset history for an employee."""
    company_id = user.company_id or user.active_org_id
    records = await db.vacation_history.find(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0}
    ).sort("reset_date", -1).to_list(50)
    return records


@people_ops_router.post("/time-off/reset-anniversary/{employee_id}")
async def manual_anniversary_reset(employee_id: str, user: User = Depends(get_current_user)):
    """Manually trigger the anniversary reset for one employee (with unlimited carry-over)."""
    company_id = user.company_id or user.active_org_id
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    result = await reset_employee_vacation_anniversary(employee)
    return {"success": True, **result}


async def run_daily_vacation_anniversary_reset():
    """Scheduler entry-point: reset vacations for all employees whose hire_date anniversary is today.
    Runs daily via APScheduler at 00:30 local time.
    """
    today = datetime.now(timezone.utc).date()
    # Find employees whose hire_date month/day matches today
    all_active = await db.employees.find(
        {"status": "active", "hire_date": {"$ne": None}},
        {"_id": 0}
    ).to_list(5000)
    resets = 0
    for emp in all_active:
        hd = _parse_date(emp.get("hire_date"))
        if not hd:
            continue
        # Skip employees with <6 months of service (their anniversary hasn't triggered eligibility yet)
        # Actually the first anniversary IS when 12 months completed; anniversary reset happens from year 1 onwards
        if (today - hd).days < 365:
            continue
        # Match month/day (with Feb 29 → Feb 28 fallback)
        target_month, target_day = hd.month, hd.day
        if target_month == 2 and target_day == 29:
            # Handle in non-leap year
            if today.month == 2 and today.day == 28 and not _is_leap_year(today.year):
                pass  # match
            elif today.month == 2 and today.day == 29:
                pass  # match
            else:
                continue
        elif today.month != target_month or today.day != target_day:
            continue
        # Avoid double-reset if already reset today
        last_reset = emp.get("vacation_last_reset_at")
        if last_reset:
            try:
                last_date = last_reset.date() if hasattr(last_reset, "date") else _parse_date(last_reset)
                if last_date == today:
                    continue
            except Exception:
                pass
        await reset_employee_vacation_anniversary(emp)
        resets += 1
    return resets


def _is_leap_year(y):
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


# ==================== OVERTIME / HORAS EXTRAS ENDPOINTS ====================

# --------------------------------------------------------------------------
# Period-based overtime (new flow — Feb 2026)
# --------------------------------------------------------------------------
# Legacy per-day overtime_requests remain untouched for backwards compat.
# Period requests live in `overtime_period_requests` and hold daily details
# embedded in `daily_entries`.
# --------------------------------------------------------------------------

def _compute_period_bounds(period_type: str, ref_date_iso: str) -> tuple[str, str]:
    """Given a period_type ('weekly'|'biweekly'|'monthly') and a reference date (YYYY-MM-DD),
    return (start_date, end_date) as ISO strings inclusive."""
    from datetime import date as _date, timedelta as _td
    y, m, d = [int(x) for x in ref_date_iso.split("-")]
    ref = _date(y, m, d)
    if period_type == "weekly":
        # Monday - Sunday
        start = ref - _td(days=ref.weekday())
        end = start + _td(days=6)
    elif period_type == "biweekly":
        # 1-15 or 16-EOM (Dominican Republic quincena convention)
        if ref.day <= 15:
            start = ref.replace(day=1)
            end = ref.replace(day=15)
        else:
            start = ref.replace(day=16)
            # last day of month
            if ref.month == 12:
                next_month_first = _date(ref.year + 1, 1, 1)
            else:
                next_month_first = _date(ref.year, ref.month + 1, 1)
            end = next_month_first - _td(days=1)
    elif period_type == "monthly":
        start = ref.replace(day=1)
        if ref.month == 12:
            next_month_first = _date(ref.year + 1, 1, 1)
        else:
            next_month_first = _date(ref.year, ref.month + 1, 1)
        end = next_month_first - _td(days=1)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid period_type: {period_type}")
    return start.isoformat(), end.isoformat()


async def _resolve_employee_overtime_period(company_id: str, employee: dict) -> str:
    """Return employee-level override or company default. Fallback: 'biweekly'."""
    per_emp = employee.get("overtime_period_type")
    if per_emp in ("weekly", "biweekly", "monthly"):
        return per_emp
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0, "overtime_period_type": 1}) or {}
    return config.get("overtime_period_type") or "biweekly"


@people_ops_router.get("/overtime/period-config")
async def get_overtime_period_config(user: User = Depends(get_current_user)):
    """Return company-default period type + payment mode + list of per-employee overrides."""
    company_id = user.company_id or user.active_org_id
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0, "overtime_period_type": 1, "overtime_payment_mode": 1}) or {}
    company_default = config.get("overtime_period_type") or "biweekly"
    payment_mode = config.get("overtime_payment_mode") or "integrated"  # 'integrated' | 'separate'
    overrides_cursor = db.employees.find(
        {
            "company_id": company_id,
            "$or": [
                {"overtime_period_type": {"$in": ["weekly", "biweekly", "monthly"]}},
                {"overtime_payment_mode": {"$in": ["integrated", "separate"]}},
            ],
        },
        {"_id": 0, "employee_id": 1, "full_name": 1, "overtime_period_type": 1, "overtime_payment_mode": 1},
    )
    overrides = await overrides_cursor.to_list(500)
    return {
        "company_default": company_default,
        "overtime_payment_mode": payment_mode,
        "employee_overrides": overrides,
    }


@people_ops_router.put("/overtime/period-config")
async def update_overtime_period_config(data: dict, user: User = Depends(get_current_user)):
    """Set company defaults. Body accepts:
      period_type: "weekly"|"biweekly"|"monthly"
      overtime_payment_mode: "integrated" (payroll includes base for OT hrs → OT payment = bonus only)
                          or "separate" (OT paid separately from payroll → OT payment = base + bonus)
    """
    company_id = user.company_id or user.active_org_id
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if "period_type" in data:
        period_type = data.get("period_type")
        if period_type not in ("weekly", "biweekly", "monthly"):
            raise HTTPException(status_code=400, detail="period_type must be weekly, biweekly or monthly")
        updates["overtime_period_type"] = period_type
    if "overtime_payment_mode" in data:
        mode = data.get("overtime_payment_mode")
        if mode not in ("integrated", "separate"):
            raise HTTPException(status_code=400, detail="overtime_payment_mode must be 'integrated' or 'separate'")
        updates["overtime_payment_mode"] = mode
    if len(updates) == 1:  # only updated_at
        raise HTTPException(status_code=400, detail="Provide period_type and/or overtime_payment_mode")
    await db.payroll_config.update_one(
        {"company_id": company_id},
        {"$set": updates},
        upsert=True,
    )
    return {"ok": True, **updates}


@people_ops_router.put("/overtime/employee-period/{employee_id}")
async def set_employee_overtime_period(employee_id: str, data: dict, user: User = Depends(get_current_user)):
    """Override period_type and/or payment_mode for a single employee.
    Body may contain:
      period_type: "weekly"|"biweekly"|"monthly"|null (null → remove override)
      overtime_payment_mode: "integrated"|"separate"|null (null → remove override)
    """
    company_id = user.company_id or user.active_org_id
    set_updates: dict = {}
    unset_updates: dict = {}

    if "period_type" in data:
        period_type = data.get("period_type")
        if period_type is None:
            unset_updates["overtime_period_type"] = ""
        elif period_type in ("weekly", "biweekly", "monthly"):
            set_updates["overtime_period_type"] = period_type
        else:
            raise HTTPException(status_code=400, detail="period_type must be weekly/biweekly/monthly or null")

    if "overtime_payment_mode" in data:
        mode = data.get("overtime_payment_mode")
        if mode is None:
            unset_updates["overtime_payment_mode"] = ""
        elif mode in ("integrated", "separate"):
            set_updates["overtime_payment_mode"] = mode
        else:
            raise HTTPException(status_code=400, detail="overtime_payment_mode must be 'integrated'/'separate' or null")

    if not set_updates and not unset_updates:
        raise HTTPException(status_code=400, detail="Provide period_type and/or overtime_payment_mode")

    mongo_op: dict = {}
    if set_updates:
        mongo_op["$set"] = set_updates
    if unset_updates:
        mongo_op["$unset"] = unset_updates

    result = await db.employees.update_one(
        {"company_id": company_id, "employee_id": employee_id},
        mongo_op,
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {
        "ok": True,
        "employee_id": employee_id,
        "period_type": set_updates.get("overtime_period_type") or (None if "overtime_period_type" in unset_updates else "unchanged"),
        "overtime_payment_mode": set_updates.get("overtime_payment_mode") or (None if "overtime_payment_mode" in unset_updates else "unchanged"),
    }


@people_ops_router.get("/overtime/periods")
async def list_overtime_periods(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    limit: int = 100,
    user: User = Depends(get_current_user),
):
    """List period-based overtime requests (new flow)."""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    docs = await db.overtime_period_requests.find(query, {"_id": 0}).sort("start_date", -1).to_list(limit)
    return docs


@people_ops_router.get("/overtime/periods/{overtime_period_id}")
async def get_overtime_period(overtime_period_id: str, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    doc = await db.overtime_period_requests.find_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Period request not found")
    return doc


async def _compute_shortfall_hours(company_id: str, employee_id: str, start_date: str, end_date: str) -> tuple[float, float, float]:
    """Return (scheduled_gross_hours, days_off_hours, time_off_hours) for the period.
    - scheduled_gross_hours: sum of pattern hours across all days in period (before subtractions)
    - days_off_hours: hours the employee would have worked but marked as day-off
    - time_off_hours: approved time-off overlapping the period, in hours
    Total shortfall = days_off_hours + time_off_hours
    """
    from datetime import date as _date, timedelta as _td

    # Load schedule versions
    schedules = await db.employee_schedules.find(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "effective_from": 1, "effective_to": 1, "weekly_pattern": 1},
    ).sort("effective_from", 1).to_list(500)

    def pick_schedule(iso: str):
        for s in schedules:
            f = s.get("effective_from") or "0000-01-01"
            t = s.get("effective_to") or "9999-12-31"
            if f <= iso <= t:
                return s
        return None

    # Load days-off in range
    dof = await db.employee_days_off.find(
        {"company_id": company_id, "employee_id": employee_id, "date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0, "date": 1},
    ).to_list(500)
    days_off_dates = {d["date"] for d in dof}

    y1, m1, d1 = [int(x) for x in start_date.split("-")]
    y2, m2, d2 = [int(x) for x in end_date.split("-")]
    cur = _date(y1, m1, d1); end = _date(y2, m2, d2)
    scheduled_gross = 0.0
    days_off_hours = 0.0
    while cur <= end:
        iso = cur.isoformat()
        s = pick_schedule(iso)
        day_name = DAYS_OF_WEEK[cur.weekday()]
        hrs = 0.0
        if s:
            hrs = float(((s.get("weekly_pattern") or {}).get(day_name) or {}).get("work_hours") or 0)
        scheduled_gross += hrs
        if iso in days_off_dates:
            days_off_hours += hrs
        cur = cur + _td(days=1)

    # Approved time-off overlapping the period (assume 8h/day, or use hours field if present)
    tofs = await db.time_off_requests.find(
        {
            "company_id": company_id,
            "employee_id": employee_id,
            "status": "approved",
            "start_date": {"$lte": end_date},
            "end_date": {"$gte": start_date},
        },
        {"_id": 0, "start_date": 1, "end_date": 1, "days_requested": 1, "hours": 1},
    ).to_list(200)

    time_off_hours = 0.0
    for t in tofs:
        # Clip to period
        f = max(t["start_date"], start_date)
        u = min(t["end_date"], end_date)
        if u < f:
            continue
        # Sum expected hours per day in overlap (using schedule)
        cy1, cm1, cd1 = [int(x) for x in f.split("-")]
        cy2, cm2, cd2 = [int(x) for x in u.split("-")]
        cur = _date(cy1, cm1, cd1); end2 = _date(cy2, cm2, cd2)
        while cur <= end2:
            iso = cur.isoformat()
            s = pick_schedule(iso)
            day_name = DAYS_OF_WEEK[cur.weekday()]
            hrs = 0.0
            if s:
                hrs = float(((s.get("weekly_pattern") or {}).get(day_name) or {}).get("work_hours") or 0)
            time_off_hours += hrs
            cur = cur + _td(days=1)

    return round(scheduled_gross, 2), round(days_off_hours, 2), round(time_off_hours, 2)


def _apply_shortfall_to_totals(totals: dict, shortfall: float) -> dict:
    """Return effective_totals with OT hours reduced by shortfall.
    Reduction is applied in order: hours_35 first (least-premium), then night, holiday, 100%.
    (Reason: the missing normal hours "eat into" the least valuable OT bucket first.)"""
    if shortfall <= 0:
        return dict(totals)
    remaining = float(shortfall)
    net = dict(totals)
    for key in ("hours_35", "hours_night", "hours_holiday", "hours_100"):
        v = float(net.get(key) or 0)
        take = min(remaining, v)
        net[key] = round(v - take, 2)
        remaining -= take
        if remaining <= 0:
            break
    net["total_hours"] = round(sum(float(net.get(k) or 0) for k in ("hours_35", "hours_night", "hours_holiday", "hours_100")), 2)
    return net


def _compute_period_totals_and_amount(daily_entries: list, hourly_rate: float, rates: dict) -> tuple[dict, float, float]:
    """Sum hours per category across daily_entries and compute estimated amounts.

    Returns (totals, estimated_amount_total, estimated_amount_extra_only).
    - estimated_amount_total = hours × hourly_rate × multiplier
        (full pay for OT hours: base + surcharge — used when OT is paid separately from payroll)
    - estimated_amount_extra_only = hours × hourly_rate × (multiplier - 1)
        (only the surcharge/bonus above base pay — used when base is already covered by payroll salary)
    """
    total_35 = total_night = total_holiday = total_100 = 0.0
    for entry in daily_entries or []:
        total_35 += float(entry.get("hours_35") or 0)
        total_night += float(entry.get("hours_night") or 0)
        total_holiday += float(entry.get("hours_holiday") or 0)
        total_100 += float(entry.get("hours_100") or 0)
    totals = {
        "hours_35": round(total_35, 2),
        "hours_night": round(total_night, 2),
        "hours_holiday": round(total_holiday, 2),
        "hours_100": round(total_100, 2),
        "total_hours": round(total_35 + total_night + total_holiday + total_100, 2),
    }
    total_full = (
        total_35 * hourly_rate * rates["rate_35"]
        + total_night * hourly_rate * rates["rate_night"]
        + total_holiday * hourly_rate * rates["rate_holiday"]
        + total_100 * hourly_rate * rates["rate_100"]
    )
    extra_only = (
        total_35 * hourly_rate * max(0, rates["rate_35"] - 1)
        + total_night * hourly_rate * max(0, rates["rate_night"] - 1)
        + total_holiday * hourly_rate * max(0, rates["rate_holiday"] - 1)
        + total_100 * hourly_rate * max(0, rates["rate_100"] - 1)
    )
    return totals, round(total_full, 2), round(extra_only, 2)


async def _resolve_ot_rates(company_id: str) -> tuple[dict, float]:
    """Return ({rate_35, rate_night, rate_holiday, rate_100}, hours_per_month)."""
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0}) or {}
    return (
        {
            "rate_35": float(config.get("overtime_rate_35") or 1.35),
            "rate_night": float(config.get("overtime_rate_night") or 1.15),
            "rate_holiday": float(config.get("overtime_rate_holiday") or 2.0),
            "rate_100": float(config.get("overtime_rate_100") or 2.0),
        },
        float(config.get("overtime_hours_per_month") or 192.0),
    )


async def _employee_hourly_rate(employee: dict, hours_per_month: float) -> float:
    base_salary = float(employee.get("base_salary") or 0)
    freq = employee.get("payment_frequency", "biweekly")
    if freq == "monthly":
        monthly = base_salary
    elif freq == "biweekly":
        monthly = base_salary * 2
    else:  # weekly
        monthly = base_salary * 4
    return (monthly / hours_per_month) if hours_per_month else 0


@people_ops_router.post("/overtime/periods")
async def create_overtime_period(data: dict, user: User = Depends(get_current_user)):
    """Create a period-based overtime request with embedded daily_entries.
    Body:
      employee_id, period_type ('weekly'|'biweekly'|'monthly'),
      ref_date (YYYY-MM-DD anywhere in the period),
      daily_entries: [{date, hours_35, hours_night, hours_holiday, hours_100, notes?}],
      reason?, notes?
    """
    company_id = user.company_id or user.active_org_id
    employee_id = data.get("employee_id")
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1, "base_salary": 1, "payment_frequency": 1, "overtime_period_type": 1},
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    period_type = data.get("period_type") or await _resolve_employee_overtime_period(company_id, employee)
    if period_type not in ("weekly", "biweekly", "monthly"):
        raise HTTPException(status_code=400, detail="Invalid period_type")

    ref_date = data.get("ref_date") or data.get("start_date") or datetime.now(timezone.utc).date().isoformat()
    start_date, end_date = _compute_period_bounds(period_type, ref_date)

    # Validate daily_entries fall within period
    daily_entries = data.get("daily_entries") or []
    normalized: list[dict] = []
    for e in daily_entries:
        d = e.get("date")
        if not d:
            continue
        if d < start_date or d > end_date:
            raise HTTPException(status_code=400, detail=f"Daily entry {d} outside period {start_date}..{end_date}")
        normalized.append({
            "date": d,
            "hours_35": float(e.get("hours_35") or 0),
            "hours_night": float(e.get("hours_night") or 0),
            "hours_holiday": float(e.get("hours_holiday") or 0),
            "hours_100": float(e.get("hours_100") or 0),
            "notes": (e.get("notes") or "").strip() or None,
        })

    rates, hours_per_month = await _resolve_ot_rates(company_id)
    hourly_rate = await _employee_hourly_rate(employee, hours_per_month)
    totals, estimated_total, estimated_extra = _compute_period_totals_and_amount(normalized, hourly_rate, rates)

    # Compute shortfall from schedule + time-off / days-off, apply to get effective (net) OT
    sched_gross, days_off_h, time_off_h = await _compute_shortfall_hours(company_id, employee_id, start_date, end_date)
    shortfall = days_off_h + time_off_h
    net_totals = _apply_shortfall_to_totals(totals, shortfall)
    net_amount_total = round(
        net_totals["hours_35"] * hourly_rate * rates["rate_35"]
        + net_totals["hours_night"] * hourly_rate * rates["rate_night"]
        + net_totals["hours_holiday"] * hourly_rate * rates["rate_holiday"]
        + net_totals["hours_100"] * hourly_rate * rates["rate_100"],
        2,
    )
    net_amount_extra = round(
        net_totals["hours_35"] * hourly_rate * max(0, rates["rate_35"] - 1)
        + net_totals["hours_night"] * hourly_rate * max(0, rates["rate_night"] - 1)
        + net_totals["hours_holiday"] * hourly_rate * max(0, rates["rate_holiday"] - 1)
        + net_totals["hours_100"] * hourly_rate * max(0, rates["rate_100"] - 1),
        2,
    )

    overtime_period_id = f"otp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    doc = {
        "overtime_period_id": overtime_period_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "period_type": period_type,
        "start_date": start_date,
        "end_date": end_date,
        "daily_entries": normalized,
        "totals": totals,
        "hourly_rate_at_creation": round(hourly_rate, 4),
        "rates_at_creation": rates,
        # Raw amounts (from entered hours as-is, ignoring shortfall)
        "estimated_amount": estimated_total,
        "estimated_amount_extra_only": estimated_extra,
        # Shortfall-adjusted (effective) amounts and totals
        "shortfall_hours": round(shortfall, 2),
        "shortfall_days_off_hours": days_off_h,
        "shortfall_time_off_hours": time_off_h,
        "scheduled_gross_hours": sched_gross,
        "effective_totals": net_totals,
        "estimated_amount_effective": net_amount_total,
        "estimated_amount_effective_extra_only": net_amount_extra,
        "status": "pending",
        "reason": data.get("reason"),
        "notes": data.get("notes"),
        "created_at": now,
        "created_by": user.user_id,
        "updated_at": now,
    }
    await db.overtime_period_requests.insert_one(doc)
    return {
        "overtime_period_id": overtime_period_id,
        "start_date": start_date,
        "end_date": end_date,
        **totals,
        "estimated_amount": estimated_total,
        "estimated_amount_extra_only": estimated_extra,
        "shortfall_hours": round(shortfall, 2),
        "estimated_amount_effective": net_amount_total,
        "estimated_amount_effective_extra_only": net_amount_extra,
    }


@people_ops_router.put("/overtime/periods/{overtime_period_id}")
async def update_overtime_period(overtime_period_id: str, data: dict, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    existing = await db.overtime_period_requests.find_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Period request not found")
    if existing.get("status") in ("approved", "paid"):
        raise HTTPException(status_code=400, detail="Cannot edit an approved or paid period")

    daily_entries = data.get("daily_entries")
    update: dict = {}
    if daily_entries is not None:
        start_date = existing["start_date"]; end_date = existing["end_date"]
        normalized = []
        for e in daily_entries:
            d = e.get("date")
            if not d:
                continue
            if d < start_date or d > end_date:
                raise HTTPException(status_code=400, detail=f"Daily entry {d} outside period {start_date}..{end_date}")
            normalized.append({
                "date": d,
                "hours_35": float(e.get("hours_35") or 0),
                "hours_night": float(e.get("hours_night") or 0),
                "hours_holiday": float(e.get("hours_holiday") or 0),
                "hours_100": float(e.get("hours_100") or 0),
                "notes": (e.get("notes") or "").strip() or None,
            })
        employee = await db.employees.find_one(
            {"company_id": company_id, "employee_id": existing["employee_id"]},
            {"_id": 0, "base_salary": 1, "payment_frequency": 1},
        ) or {}
        rates, hours_per_month = await _resolve_ot_rates(company_id)
        hourly_rate = await _employee_hourly_rate(employee, hours_per_month)
        totals, estimated_total, estimated_extra = _compute_period_totals_and_amount(normalized, hourly_rate, rates)
        # Recompute shortfall too
        sched_gross, days_off_h, time_off_h = await _compute_shortfall_hours(
            company_id, existing["employee_id"], existing["start_date"], existing["end_date"],
        )
        shortfall = days_off_h + time_off_h
        net_totals = _apply_shortfall_to_totals(totals, shortfall)
        net_amount_total = round(
            net_totals["hours_35"] * hourly_rate * rates["rate_35"]
            + net_totals["hours_night"] * hourly_rate * rates["rate_night"]
            + net_totals["hours_holiday"] * hourly_rate * rates["rate_holiday"]
            + net_totals["hours_100"] * hourly_rate * rates["rate_100"],
            2,
        )
        net_amount_extra = round(
            net_totals["hours_35"] * hourly_rate * max(0, rates["rate_35"] - 1)
            + net_totals["hours_night"] * hourly_rate * max(0, rates["rate_night"] - 1)
            + net_totals["hours_holiday"] * hourly_rate * max(0, rates["rate_holiday"] - 1)
            + net_totals["hours_100"] * hourly_rate * max(0, rates["rate_100"] - 1),
            2,
        )
        update.update({
            "daily_entries": normalized,
            "totals": totals,
            "estimated_amount": estimated_total,
            "estimated_amount_extra_only": estimated_extra,
            "shortfall_hours": round(shortfall, 2),
            "shortfall_days_off_hours": days_off_h,
            "shortfall_time_off_hours": time_off_h,
            "scheduled_gross_hours": sched_gross,
            "effective_totals": net_totals,
            "estimated_amount_effective": net_amount_total,
            "estimated_amount_effective_extra_only": net_amount_extra,
        })
    if "reason" in data:
        update["reason"] = data["reason"]
    if "notes" in data:
        update["notes"] = data["notes"]
    update["updated_at"] = datetime.now(timezone.utc)
    await db.overtime_period_requests.update_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id},
        {"$set": update},
    )
    return {"ok": True, "overtime_period_id": overtime_period_id}


@people_ops_router.post("/overtime/periods/{overtime_period_id}/approve")
async def approve_overtime_period(overtime_period_id: str, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    result = await db.overtime_period_requests.update_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id, "status": "pending"},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc),
            "approved_by": user.user_id,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pending period not found")
    return {"ok": True, "overtime_period_id": overtime_period_id, "status": "approved"}


@people_ops_router.post("/overtime/periods/{overtime_period_id}/reject")
async def reject_overtime_period(overtime_period_id: str, data: dict, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    reason = (data or {}).get("reason", "")
    result = await db.overtime_period_requests.update_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id, "status": "pending"},
        {"$set": {
            "status": "rejected",
            "rejected_at": datetime.now(timezone.utc),
            "rejected_by": user.user_id,
            "rejection_reason": reason,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pending period not found")
    return {"ok": True, "overtime_period_id": overtime_period_id, "status": "rejected"}


@people_ops_router.delete("/overtime/periods/{overtime_period_id}")
async def delete_overtime_period(overtime_period_id: str, user: User = Depends(get_current_user)):
    company_id = user.company_id or user.active_org_id
    existing = await db.overtime_period_requests.find_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id}, {"_id": 0, "status": 1}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Period request not found")
    if existing.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Cannot delete a paid period")
    await db.overtime_period_requests.delete_one(
        {"company_id": company_id, "overtime_period_id": overtime_period_id}
    )
    return {"ok": True}


# --------------------------------------------------------------------------
# Legacy per-day overtime (kept for backwards compat)
# --------------------------------------------------------------------------

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
    Used in the 'Create Payroll Period' dialog to preview OT to be included.

    Includes both legacy per-day `overtime_requests` and the newer
    `overtime_period_requests` collection (period-based OT).
    """
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
            "ot_period_ids": [],
        })
        acc["hours_35"] += float(ot.get("hours_35") or 0)
        acc["hours_night"] += float(ot.get("hours_night") or 0)
        acc["hours_holiday"] += float(ot.get("hours_holiday") or 0)
        acc["hours_100"] += float(ot.get("hours_100") or 0)
        acc["estimated_amount"] += float(ot.get("estimated_amount") or 0)
        acc["ot_ids"].append(ot.get("overtime_id"))

    # Include period-based OT overlapping the date range
    ot_periods = await db.overtime_period_requests.find({
        "company_id": company_id,
        "status": "approved",
        "$or": [{"payroll_period_id": None}, {"payroll_period_id": {"$exists": False}}],
        "start_date": {"$lte": end_date},
        "end_date": {"$gte": start_date},
    }, {"_id": 0}).sort("start_date", 1).to_list(500)

    for otp in ot_periods:
        emp_id = otp.get("employee_id")
        if not emp_id:
            continue
        eff_totals = otp.get("effective_totals") or otp.get("totals") or {}
        acc = by_emp.setdefault(emp_id, {
            "employee_id": emp_id,
            "employee_name": otp.get("employee_name"),
            "hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0,
            "estimated_amount": 0.0,
            "ot_ids": [],
            "ot_period_ids": [],
        })
        acc["hours_35"] += float(eff_totals.get("hours_35") or 0)
        acc["hours_night"] += float(eff_totals.get("hours_night") or 0)
        acc["hours_holiday"] += float(eff_totals.get("hours_holiday") or 0)
        acc["hours_100"] += float(eff_totals.get("hours_100") or 0)
        acc["estimated_amount"] += float(otp.get("estimated_amount_effective") or otp.get("estimated_amount") or 0)
        acc["ot_period_ids"].append(otp.get("overtime_period_id"))

    total_amount = sum(o.get("estimated_amount") or 0 for o in ots)
    total_amount += sum(
        (otp.get("estimated_amount_effective") or otp.get("estimated_amount") or 0)
        for otp in ot_periods
    )

    return {
        "summary_by_employee": list(by_emp.values()),
        "raw": ots,
        "raw_periods": ot_periods,
        "total_ot_count": len(ots) + len(ot_periods),
        "total_estimated_amount": round(total_amount, 2),
    }


def _ot_period_range(period: str, ref_date: str) -> tuple[str, str, str]:
    """Returns (start, end, label) for an OT report period.
    period: 'weekly' (Mon-Sun containing ref_date) | 'biweekly' (1-15 or 16-end of ref_date's month) | 'monthly'"""
    from datetime import date as date_cls
    try:
        ref = date_cls.fromisoformat(ref_date)
    except ValueError:
        ref = date_cls.today()
    
    if period == "weekly":
        start = ref - timedelta(days=ref.weekday())  # Monday
        end = start + timedelta(days=6)
        label = f"Semana {start.isoformat()} → {end.isoformat()}"
    elif period == "biweekly":
        if ref.day <= 15:
            start = ref.replace(day=1)
            end = ref.replace(day=15)
            label = f"Quincena 1 - {ref.strftime('%B %Y')}"
        else:
            from calendar import monthrange
            start = ref.replace(day=16)
            end = ref.replace(day=monthrange(ref.year, ref.month)[1])
            label = f"Quincena 2 - {ref.strftime('%B %Y')}"
    else:  # monthly
        from calendar import monthrange
        start = ref.replace(day=1)
        end = ref.replace(day=monthrange(ref.year, ref.month)[1])
        label = ref.strftime("%B %Y")
    
    return start.isoformat(), end.isoformat(), label


@people_ops_router.get("/overtime/report")
async def overtime_report(
    period: str = "biweekly",
    date: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Aggregated OT report for a period (weekly / biweekly / monthly).
    Returns per-employee totals (hours by category + monetary amount + hourly_rate + base_salary)
    plus grand totals."""
    company_id, _ = await check_people_ops_access(user, "view")
    
    if period not in ("weekly", "biweekly", "monthly"):
        raise HTTPException(status_code=400, detail="period must be weekly | biweekly | monthly")
    
    ref_date = date or datetime.now(timezone.utc).date().isoformat()
    start_date, end_date, label = _ot_period_range(period, ref_date)
    
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0}) or {}
    hours_per_month = config.get("overtime_hours_per_month", 192.0) or 192.0
    
    query: dict = {
        "company_id": company_id,
        "date": {"$gte": start_date, "$lte": end_date},
    }
    if status:
        query["status"] = status
    
    ots = await db.overtime_requests.find(query, {"_id": 0}).sort("date", 1).to_list(5000)
    
    # Aggregate per employee
    by_emp: dict = {}
    for ot in ots:
        emp_id = ot.get("employee_id")
        if not emp_id:
            continue
        acc = by_emp.setdefault(emp_id, {
            "employee_id": emp_id,
            "employee_name": ot.get("employee_name"),
            "hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0,
            "total_hours": 0.0,
            "estimated_amount": 0.0,
            "ot_count": 0,
            "ot_statuses": {"pending": 0, "approved": 0, "processed": 0, "rejected": 0},
        })
        acc["hours_35"] += float(ot.get("hours_35") or 0)
        acc["hours_night"] += float(ot.get("hours_night") or 0)
        acc["hours_holiday"] += float(ot.get("hours_holiday") or 0)
        acc["hours_100"] += float(ot.get("hours_100") or 0)
        acc["total_hours"] += float(ot.get("total_hours") or 0)
        acc["estimated_amount"] += float(ot.get("estimated_amount") or 0)
        acc["ot_count"] += 1
        st = ot.get("status") or "pending"
        if st in acc["ot_statuses"]:
            acc["ot_statuses"][st] += 1
    
    # Decorate with salary + hourly_rate
    emp_ids = list(by_emp.keys())
    if emp_ids:
        emps = await db.employees.find(
            {"company_id": company_id, "employee_id": {"$in": emp_ids}},
            {"_id": 0, "employee_id": 1, "base_salary": 1, "payment_frequency": 1}
        ).to_list(500)
        for e in emps:
            row = by_emp.get(e["employee_id"])
            if not row:
                continue
            base = float(e.get("base_salary") or 0)
            freq = e.get("payment_frequency", "biweekly")
            monthly = base if freq == "monthly" else (base * 2 if freq == "biweekly" else base * 4)
            row["base_salary"] = round(base, 2)
            row["monthly_salary_eq"] = round(monthly, 2)
            row["hourly_rate"] = round((monthly / hours_per_month) if hours_per_month else 0, 2)
    
    # Round all values
    rows = []
    for r in by_emp.values():
        rows.append({
            **r,
            "hours_35": round(r["hours_35"], 2),
            "hours_night": round(r["hours_night"], 2),
            "hours_holiday": round(r["hours_holiday"], 2),
            "hours_100": round(r["hours_100"], 2),
            "total_hours": round(r["total_hours"], 2),
            "estimated_amount": round(r["estimated_amount"], 2),
        })
    rows.sort(key=lambda r: -r["estimated_amount"])
    
    return {
        "period": period,
        "label": label,
        "start_date": start_date,
        "end_date": end_date,
        "rows": rows,
        "totals": {
            "ot_count": len(ots),
            "employees": len(rows),
            "hours_35": round(sum(r["hours_35"] for r in rows), 2),
            "hours_night": round(sum(r["hours_night"] for r in rows), 2),
            "hours_holiday": round(sum(r["hours_holiday"] for r in rows), 2),
            "hours_100": round(sum(r["hours_100"] for r in rows), 2),
            "total_hours": round(sum(r["total_hours"] for r in rows), 2),
            "estimated_amount": round(sum(r["estimated_amount"] for r in rows), 2),
        }
    }


@people_ops_router.get("/overtime/report/export")
async def overtime_report_export(
    period: str = "biweekly",
    date: Optional[str] = None,
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export OT report as CSV or XLSX."""
    report = await overtime_report(period=period, date=date, status=None, user=user)
    
    if format == "xlsx":
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl not installed")
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Reporte HE"
        
        # Header rows
        ws.append([f"Reporte de Horas Extras — {report['label']}"])
        ws.append([f"Rango: {report['start_date']} a {report['end_date']}"])
        ws.append([])
        
        headers = ["Empleado", "Salario Base", "Hora Normal", "Horas 35%", "Horas Nocturnas 15%",
                   "Horas Feriado 100%", "Horas Extra 100%", "Total Horas", "Monto Estimado",
                   "Solicitudes", "Aprobadas"]
        ws.append(headers)
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill("solid", fgColor="6D28D9")
        for cell in ws[4]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        
        for r in report["rows"]:
            ws.append([
                r.get("employee_name", "-"),
                r.get("base_salary", 0),
                r.get("hourly_rate", 0),
                r.get("hours_35", 0),
                r.get("hours_night", 0),
                r.get("hours_holiday", 0),
                r.get("hours_100", 0),
                r.get("total_hours", 0),
                r.get("estimated_amount", 0),
                r.get("ot_count", 0),
                r.get("ot_statuses", {}).get("approved", 0) + r.get("ot_statuses", {}).get("processed", 0),
            ])
        
        # Totals row
        t = report["totals"]
        ws.append([])
        ws.append(["TOTALES", "", "", t.get("hours_35", 0), t.get("hours_night", 0),
                  t.get("hours_holiday", 0), t.get("hours_100", 0),
                  t.get("total_hours", 0), t.get("estimated_amount", 0), t.get("ot_count", 0), ""])
        for cell in ws[ws.max_row]:
            cell.font = Font(bold=True)
        
        # Column widths
        for col_letter, width in zip("ABCDEFGHIJK", [28, 14, 14, 12, 14, 14, 14, 12, 16, 12, 10]):
            ws.column_dimensions[col_letter].width = width
        
        import io
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="OT_Report_{report["start_date"]}_to_{report["end_date"]}.xlsx"'}
        )
    
    # Default: CSV
    import io, csv
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([f"Reporte de Horas Extras — {report['label']}"])
    writer.writerow([f"Rango: {report['start_date']} a {report['end_date']}"])
    writer.writerow([])
    writer.writerow(["Empleado", "Salario Base", "Hora Normal", "Horas 35%", "Horas Nocturnas 15%",
                    "Horas Feriado 100%", "Horas Extra 100%", "Total Horas", "Monto Estimado",
                    "Solicitudes", "Aprobadas+Procesadas"])
    for r in report["rows"]:
        writer.writerow([
            r.get("employee_name", "-"),
            r.get("base_salary", 0),
            r.get("hourly_rate", 0),
            r.get("hours_35", 0),
            r.get("hours_night", 0),
            r.get("hours_holiday", 0),
            r.get("hours_100", 0),
            r.get("total_hours", 0),
            r.get("estimated_amount", 0),
            r.get("ot_count", 0),
            r.get("ot_statuses", {}).get("approved", 0) + r.get("ot_statuses", {}).get("processed", 0),
        ])
    t = report["totals"]
    writer.writerow([])
    writer.writerow(["TOTALES", "", "", t.get("hours_35", 0), t.get("hours_night", 0),
                    t.get("hours_holiday", 0), t.get("hours_100", 0), t.get("total_hours", 0),
                    t.get("estimated_amount", 0), t.get("ot_count", 0), ""])
    
    csv_data = buffer.getvalue()
    buffer.close()
    
    from fastapi.responses import Response
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="OT_Report_{report["start_date"]}_to_{report["end_date"]}.csv"'}
    )


@people_ops_router.get("/overtime/email-schedule")
async def get_ot_email_schedule(user: User = Depends(get_current_user)):
    """Get current OT email digest schedule settings."""
    company_id, _ = await check_people_ops_access(user, "view")
    config = await db.ot_email_schedule.find_one({"company_id": company_id}, {"_id": 0})
    if not config:
        return {
            "company_id": company_id,
            "enabled": False,
            "frequency": "biweekly",  # weekly | biweekly | monthly
            "recipients": [],
            "last_sent_at": None,
        }
    return config


@people_ops_router.put("/overtime/email-schedule")
async def update_ot_email_schedule(data: dict, user: User = Depends(get_current_user)):
    """Update OT email digest schedule settings."""
    company_id, _ = await check_people_ops_access(user, "edit")
    
    frequency = data.get("frequency", "biweekly")
    if frequency not in ("weekly", "biweekly", "monthly"):
        raise HTTPException(status_code=400, detail="frequency must be weekly | biweekly | monthly")
    
    recipients = data.get("recipients") or []
    if not isinstance(recipients, list):
        raise HTTPException(status_code=400, detail="recipients must be a list of emails")
    
    update_data = {
        "company_id": company_id,
        "enabled": bool(data.get("enabled", False)),
        "frequency": frequency,
        "recipients": [str(e).strip() for e in recipients if e],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user.user_id,
    }
    await db.ot_email_schedule.update_one(
        {"company_id": company_id},
        {"$set": update_data},
        upsert=True
    )
    return update_data


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


@people_ops_router.put("/overtime/requests/{overtime_id}")
async def update_overtime_request(
    overtime_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Edit an overtime request. Recalculates estimated_amount from hours + rates.
    Allowed for any status. Blocked if already paid in a processed payroll period.
    Body may include: date, hours_35, hours_night, hours_holiday, hours_100, reason, notes
    """
    company_id = user.company_id or user.active_org_id
    ot = await db.overtime_requests.find_one(
        {"company_id": company_id, "overtime_id": overtime_id},
        {"_id": 0}
    )
    if not ot:
        raise HTTPException(status_code=404, detail="Overtime request not found")

    # Block edit if already paid in a processed payroll period
    if ot.get("paid_in_period_id"):
        period = await db.payroll_periods.find_one(
            {"period_id": ot["paid_in_period_id"]},
            {"_id": 0, "status": 1}
        )
        if period and period.get("status") == "processed":
            raise HTTPException(status_code=400, detail="Cannot edit overtime already paid in a processed payroll period. Revert the payroll first.")

    now = datetime.now(timezone.utc)
    update: dict = {"updated_at": now}
    for f in ["date", "reason", "notes"]:
        if f in data:
            update[f] = data[f]

    # Handle hours + recalc estimated_amount
    hours_changed = any(k in data for k in ("hours_35", "hours_night", "hours_holiday", "hours_100"))
    if hours_changed:
        h35 = float(data.get("hours_35", ot.get("hours_35", 0)) or 0)
        hn = float(data.get("hours_night", ot.get("hours_night", 0)) or 0)
        hh = float(data.get("hours_holiday", ot.get("hours_holiday", 0)) or 0)
        h100 = float(data.get("hours_100", ot.get("hours_100", 0)) or 0)

        # Fetch employee + config to recompute amount
        emp = await db.employees.find_one(
            {"employee_id": ot.get("employee_id")},
            {"_id": 0, "base_salary": 1, "payment_frequency": 1}
        ) or {}
        config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0}) or {}
        rate_35 = config.get("overtime_rate_35", 1.35)
        rate_night = config.get("overtime_rate_night", 1.15)
        rate_holiday = config.get("overtime_rate_holiday", 2.0)
        rate_100 = config.get("overtime_rate_100", 2.0)
        hours_per_month = config.get("overtime_hours_per_month", 192.0) or 192.0

        base_salary = float(emp.get("base_salary") or 0)
        freq = emp.get("payment_frequency", "biweekly")
        monthly = base_salary if freq == "monthly" else (base_salary * 2 if freq == "biweekly" else base_salary * 4)
        hourly = (monthly / hours_per_month) if hours_per_month else 0

        estimated = (
            h35 * hourly * rate_35
            + hn * hourly * rate_night
            + hh * hourly * rate_holiday
            + h100 * hourly * rate_100
        )
        update["hours_35"] = h35
        update["hours_night"] = hn
        update["hours_holiday"] = hh
        update["hours_100"] = h100
        update["total_hours"] = round(h35 + hn + hh + h100, 2)
        update["estimated_amount"] = round(estimated, 2)

    await db.overtime_requests.update_one(
        {"overtime_id": overtime_id},
        {"$set": update}
    )
    return {"success": True, "message": "Overtime updated", "estimated_amount": update.get("estimated_amount", ot.get("estimated_amount"))}


@people_ops_router.delete("/overtime/requests/{overtime_id}")
async def delete_overtime_request(
    overtime_id: str,
    user: User = Depends(get_current_user)
):
    """Delete an overtime request. Blocked if already paid in a processed payroll period."""
    company_id = user.company_id or user.active_org_id
    ot = await db.overtime_requests.find_one(
        {"company_id": company_id, "overtime_id": overtime_id},
        {"_id": 0}
    )
    if not ot:
        raise HTTPException(status_code=404, detail="Overtime request not found")

    if ot.get("paid_in_period_id"):
        period = await db.payroll_periods.find_one(
            {"period_id": ot["paid_in_period_id"]},
            {"_id": 0, "status": 1}
        )
        if period and period.get("status") == "processed":
            raise HTTPException(status_code=400, detail="Cannot delete overtime already paid in a processed payroll period. Revert the payroll first.")

    await db.overtime_requests.delete_one({"overtime_id": overtime_id})
    return {"success": True, "message": "Overtime deleted"}


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


@people_ops_router.post("/loans/legacy")
async def create_legacy_loan(data: dict, user: User = Depends(get_current_user)):
    """Register a HISTORICAL loan that originated BEFORE the system was in place.
    Creates the loan directly in ACTIVE (or paid_off) status with a set of historical payments already applied.
    
    Body:
    {
      employee_id: str,
      loan_type: 'personal_loan'|'salary_advance'|'emergency_loan'|'education_loan',
      original_amount: float,              # total amount originally lent
      installments: int,                   # total installments
      installment_amount: float,           # amount per payroll period going forward
      start_date: 'YYYY-MM-DD',            # historical start date (REQUIRED)
      end_date: 'YYYY-MM-DD',              # expected end date (REQUIRED)
      reason: str,
      notes?: str,
      historical_payments: [               # payments already made before the system (can be empty)
        {payment_date: 'YYYY-MM-DD', amount: float, notes?: str}
      ]
    }
    """
    company_id = user.company_id or user.active_org_id

    employee_id = data.get("employee_id")
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1, "active_loan_balance": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Block if there is already an active loan for this employee
    existing_active = await db.loans.find_one({
        "company_id": company_id,
        "employee_id": employee_id,
        "status": "active"
    })
    if existing_active:
        raise HTTPException(
            status_code=400,
            detail=f"Employee already has an active loan with balance: ${existing_active.get('remaining_balance', 0):,.2f}"
        )

    original_amount = float(data.get("original_amount") or 0)
    installments = int(data.get("installments") or 0)
    installment_amount = float(data.get("installment_amount") or 0)
    start_date = (data.get("start_date") or "").strip()
    end_date = (data.get("end_date") or "").strip()
    loan_type = data.get("loan_type") or "personal_loan"
    historical_payments = data.get("historical_payments") or []

    # Validations
    if original_amount <= 0:
        raise HTTPException(status_code=400, detail="original_amount must be greater than 0")
    if installments <= 0:
        raise HTTPException(status_code=400, detail="installments must be greater than 0")
    if installment_amount <= 0:
        raise HTTPException(status_code=400, detail="installment_amount must be greater than 0")
    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="start_date and end_date are required")
    try:
        sd = datetime.strptime(start_date, "%Y-%m-%d").date()
        ed = datetime.strptime(end_date, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="start_date/end_date must be YYYY-MM-DD")
    if ed < sd:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")

    # Validate historical payments
    total_paid = 0.0
    normalized_payments = []
    for idx, p in enumerate(historical_payments):
        try:
            amt = float(p.get("amount") or 0)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Payment #{idx+1}: invalid amount")
        if amt <= 0:
            raise HTTPException(status_code=400, detail=f"Payment #{idx+1}: amount must be > 0")
        pdate = (p.get("payment_date") or "").strip()
        if not pdate:
            raise HTTPException(status_code=400, detail=f"Payment #{idx+1}: payment_date is required")
        try:
            datetime.strptime(pdate, "%Y-%m-%d")
        except Exception:
            raise HTTPException(status_code=400, detail=f"Payment #{idx+1}: payment_date must be YYYY-MM-DD")
        total_paid += amt
        normalized_payments.append({
            "payment_date": pdate,
            "amount": round(amt, 2),
            "notes": p.get("notes") or None
        })

    if total_paid > original_amount + 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Sum of historical payments (${total_paid:,.2f}) exceeds original amount (${original_amount:,.2f})"
        )

    installments_paid = len(normalized_payments)
    if installments_paid > installments:
        raise HTTPException(
            status_code=400,
            detail=f"Historical payments count ({installments_paid}) exceeds total installments ({installments})"
        )

    remaining_balance = round(original_amount - total_paid, 2)
    now = datetime.now(timezone.utc)
    loan_id = f"loan_{uuid.uuid4().hex[:12]}"
    status = "paid_off" if remaining_balance <= 0.01 else "active"

    loan = {
        "loan_id": loan_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "loan_type": loan_type,
        "requested_amount": round(original_amount, 2),
        "approved_amount": round(original_amount, 2),
        "installments": installments,
        "installment_amount": round(installment_amount, 2),
        "frequency": data.get("frequency") or "biweekly",
        "total_paid": round(total_paid, 2),
        "remaining_balance": remaining_balance,
        "installments_paid": installments_paid,
        "status": status,
        "reason": data.get("reason") or "Legacy loan (pre-system)",
        "notes": data.get("notes"),
        "is_legacy": True,
        "start_date": start_date,
        "end_date": end_date,
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "approved_at": now,
        "created_at": now,
        "updated_at": now
    }
    if status == "paid_off":
        loan["paid_date"] = now.date().isoformat()

    await db.loans.insert_one(loan)

    # Insert each historical payment
    for p in normalized_payments:
        await db.loan_payments.insert_one({
            "payment_id": f"lpay_{uuid.uuid4().hex[:12]}",
            "loan_id": loan_id,
            "company_id": company_id,
            "employee_id": employee_id,
            "amount": p["amount"],
            "payment_type": "historical",
            "payment_date": p["payment_date"],
            "notes": p["notes"],
            "balance_after": None,  # historical: exact running balance unknown
            "is_historical": True,
            "created_by": user.user_id,
            "created_at": now.isoformat()
        })

    # Sync employee active_loan_balance
    await db.employees.update_one(
        {"employee_id": employee_id},
        {"$set": {"active_loan_balance": remaining_balance if status == "active" else 0}}
    )

    return {
        "success": True,
        "loan_id": loan_id,
        "status": status,
        "total_paid": round(total_paid, 2),
        "installments_paid": installments_paid,
        "remaining_balance": remaining_balance
    }


@people_ops_router.get("/loans/{loan_id}/payments")
async def list_loan_payments(loan_id: str, user: User = Depends(get_current_user)):
    """List all payments (payroll deductions, manual, and historical) recorded for a loan."""
    company_id = user.company_id or user.active_org_id
    loan = await db.loans.find_one({"loan_id": loan_id, "company_id": company_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    payments = await db.loan_payments.find(
        {"loan_id": loan_id, "company_id": company_id},
        {"_id": 0}
    ).sort("payment_date", 1).to_list(500)
    return {"loan": loan, "payments": payments}


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
    frequency = data.get("frequency") or "biweekly"
    start_date = data.get("start_date", now.isoformat()[:10])
    end_date = data.get("end_date")
    
    update_fields = {
        "status": "active",
        "approved_amount": approved_amount,
        "remaining_balance": approved_amount,
        "installments": installments,
        "installment_amount": round(installment_amount, 2),
        "frequency": frequency,
        "start_date": start_date,
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "approved_at": now,
        "updated_at": now
    }
    if end_date:
        update_fields["end_date"] = end_date
    
    await db.loans.update_one(
        {"loan_id": loan_id},
        {"$set": update_fields}
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


@people_ops_router.post("/loans/{loan_id}/payment")
async def record_manual_loan_payment(
    loan_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Record a manual loan payment (outside of payroll). 
    Body: {amount: float, payment_type: 'cash'|'transfer'|'other' (default 'manual'), notes?: str, payment_date?: 'YYYY-MM-DD'}
    Reduces the loan's remaining_balance and employee's active_loan_balance."""
    company_id, _ = await check_people_ops_access(user, "edit")
    
    amount = float(data.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than 0")
    
    loan = await db.loans.find_one({"loan_id": loan_id, "company_id": company_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.get("status") != "active":
        raise HTTPException(status_code=400, detail=f"Loan is not active (status={loan.get('status')})")
    
    remaining = float(loan.get("remaining_balance") or 0)
    if amount > remaining:
        # Cap to remaining balance instead of erroring
        amount = remaining
    
    now = datetime.now(timezone.utc)
    new_balance = max(0, remaining - amount)
    new_paid = float(loan.get("total_paid") or 0) + amount
    new_installments_paid = int(loan.get("installments_paid") or 0) + 1
    
    update_data = {
        "remaining_balance": round(new_balance, 2),
        "total_paid": round(new_paid, 2),
        "installments_paid": new_installments_paid,
        "updated_at": now.isoformat()
    }
    if new_balance <= 0:
        update_data["status"] = "paid"
        update_data["paid_date"] = now.date().isoformat()
    
    await db.loans.update_one({"loan_id": loan_id}, {"$set": update_data})
    
    # Sync employee's active_loan_balance
    employee_id = loan.get("employee_id")
    if employee_id:
        emp_update = {"$inc": {"active_loan_balance": -amount}}
        if new_balance <= 0:
            emp_update = {"$set": {"active_loan_balance": 0}}
        await db.employees.update_one({"employee_id": employee_id}, emp_update)
    
    payment_record = {
        "payment_id": f"lpay_{uuid.uuid4().hex[:12]}",
        "loan_id": loan_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "amount": round(amount, 2),
        "payment_type": data.get("payment_type") or "manual",
        "payment_date": data.get("payment_date") or now.date().isoformat(),
        "notes": data.get("notes"),
        "balance_after": round(new_balance, 2),
        "created_by": user.user_id,
        "created_at": now.isoformat()
    }
    await db.loan_payments.insert_one(payment_record)
    payment_record.pop("_id", None)
    
    return {
        "success": True,
        "payment": payment_record,
        "new_balance": round(new_balance, 2),
        "installments_paid": new_installments_paid,
        "loan_status": "paid" if new_balance <= 0 else "active"
    }


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


@people_ops_router.delete("/offboarding/{offboarding_id}")
async def delete_offboarding(offboarding_id: str, user: User = Depends(get_current_user)):
    """Delete an offboarding record.
    - If status is 'processed' or 'approved' AND the employee is currently 'terminated' from this record,
      re-activate the employee (restore access) and roll back the termination_date.
    - Records in any status can be deleted; deleted records are removed from the database.
    """
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)

    record = await db.offboarding.find_one(
        {"company_id": company_id, "offboarding_id": offboarding_id},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # If the record has already terminated the employee, reactivate them
    if record.get("status") in ("approved", "processed"):
        emp_id = record.get("employee_id")
        emp = await db.employees.find_one(
            {"company_id": company_id, "employee_id": emp_id},
            {"_id": 0, "status": 1, "termination_date": 1}
        )
        if emp and emp.get("status") == "terminated" and emp.get("termination_date") == record.get("termination_date"):
            await db.employees.update_one(
                {"employee_id": emp_id},
                {"$set": {
                    "status": "active",
                    "termination_date": None,
                    "updated_at": now
                }}
            )

    await db.offboarding.delete_one({"offboarding_id": offboarding_id})
    return {"success": True, "message": "Offboarding record deleted"}


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

