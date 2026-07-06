# models/people_ops.py - People Operations / RRHH Models
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ==================== DEPARTMENTS ====================

class DepartmentCreate(BaseModel):
    """Create a new department"""
    name: str  # Primary display name (typically Spanish for ES users)
    name_en: Optional[str] = None  # English label (optional)
    name_es: Optional[str] = None  # Spanish label (optional)
    code: Optional[str] = None
    description: Optional[str] = None
    head_user_id: Optional[str] = None  # Department head/manager
    parent_department_id: Optional[str] = None  # For hierarchy
    display_order: int = 0
    is_active: bool = True


class Department(BaseModel):
    """Department model - organizational grouping above Cost Centers"""
    department_id: str
    company_id: str
    name: str
    name_en: Optional[str] = None
    name_es: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    head_user_id: Optional[str] = None
    head_name: Optional[str] = None  # Denormalized for display
    parent_department_id: Optional[str] = None
    display_order: int = 0
    is_active: bool = True
    employee_count: int = 0  # Calculated
    cost_center_count: int = 0  # Calculated
    created_at: datetime
    updated_at: datetime


class DepartmentUpdate(BaseModel):
    """Update department fields"""
    name: Optional[str] = None
    name_en: Optional[str] = None
    name_es: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    head_user_id: Optional[str] = None
    parent_department_id: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


# ==================== COST CENTERS ====================

# Cost Center Types (generic, multi-industry)
class CostCenterType(str, Enum):
    OPERATING = "operating"        # Day-to-day operations
    SUPPORT = "support"            # Support functions (IT, HR, Admin)
    REVENUE = "revenue"            # Revenue-generating (Sales, Marketing)
    INVESTMENT = "investment"      # CapEx, R&D
    PROJECT = "project"            # Project-based cost tracking
    OVERHEAD = "overhead"          # General overhead


class CostCenterCreate(BaseModel):
    name: str
    code: Optional[str] = None  # Accounting code
    description: Optional[str] = None
    department_id: Optional[str] = None  # Link to parent department
    annual_budget: Optional[float] = None
    responsible_user_id: Optional[str] = None
    is_active: bool = True
    is_system: bool = False  # True for predefined templates
    # New fields for hierarchy and classification
    parent_cost_center_id: Optional[str] = None  # For hierarchy
    cc_type: Optional[str] = None  # operating, support, revenue, etc.
    default_budget_enabled: bool = True


class CostCenterBudgetUpdate(BaseModel):
    """Update budget by period - monthly, quarterly, or annual"""
    budget_type: str = "annual"  # annual, quarterly, monthly
    year: int
    period: Optional[int] = None  # 1-4 for quarterly, 1-12 for monthly
    amount: float


class CostCenter(BaseModel):
    cost_center_id: str
    company_id: str
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    department_id: Optional[str] = None  # Link to parent department
    department_name: Optional[str] = None  # Denormalized for display
    annual_budget: Optional[float] = None
    # Granular budgets
    monthly_budgets: Optional[dict] = None  # {"2026-01": 5000, "2026-02": 6000, ...}
    quarterly_budgets: Optional[dict] = None  # {"2026-Q1": 15000, "2026-Q2": 18000, ...}
    current_spend: float = 0.0  # Calculated from expenses
    responsible_user_id: Optional[str] = None
    responsible_name: Optional[str] = None
    is_active: bool = True
    is_system: bool = False
    # Extended fields
    parent_cost_center_id: Optional[str] = None  # Hierarchy support
    cc_type: Optional[str] = None  # operating, support, revenue, investment, project, overhead
    default_budget_enabled: bool = True
    created_at: datetime
    updated_at: datetime


class CostCenterUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    department_id: Optional[str] = None
    annual_budget: Optional[float] = None
    responsible_user_id: Optional[str] = None
    is_active: Optional[bool] = None
    parent_cost_center_id: Optional[str] = None
    cc_type: Optional[str] = None
    default_budget_enabled: Optional[bool] = None


# ==================== EMPLOYEES ====================

class ContractType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    FREELANCE = "freelance"
    INTERN = "intern"


class EmployeeStatus(str, Enum):
    ACTIVE = "active"
    ON_LEAVE = "on_leave"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"


class PaymentFrequency(str, Enum):
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"  # Quincenal
    MONTHLY = "monthly"


class EmployeeCreate(BaseModel):
    # Personal Info
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    date_of_birth: Optional[str] = None
    national_id: Optional[str] = None  # Cédula
    address: Optional[str] = None
    city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    
    # Employment Info
    job_title: str
    job_role_id: Optional[str] = None  # FK to job_postings for role catalog
    department_id: Optional[str] = None  # FK to departments collection
    department: Optional[str] = None  # Legacy string field (auto-sync from department_id)
    cost_center_id: Optional[str] = None
    manager_id: Optional[str] = None  # Reports to
    is_manager: bool = False  # Flag for org chart hierarchy
    hire_date: str
    contract_type: ContractType = ContractType.FULL_TIME
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    
    # Compensation
    base_salary: float
    base_salary_basis: Optional[str] = "monthly"  # "monthly"|"biweekly"|"weekly" — how the base_salary is expressed
    payment_frequency: PaymentFrequency = PaymentFrequency.BIWEEKLY
    currency: Optional[str] = None  # Falls back to company.currency if not set
    weekly_hours_regular: float = 44.0  # Regular working hours per week (RD legal max: 44)
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_type: Optional[str] = None  # savings, checking, payroll
    routing_number: Optional[str] = None  # SWIFT, BIC, or routing number
    
    # Benefits & Deductions
    has_health_insurance: bool = True  # ARS (health insurance deduction)
    has_pension: bool = True  # AFP (pension deduction)
    has_isr: bool = True  # ISR (income tax withholding)
    afp_provider: Optional[str] = None
    ars_provider: Optional[str] = None
    # Manual deduction overrides (if set, these MONTHLY amounts replace the auto-calc;
    # for biweekly periods they are auto-divided by 2)
    afp_override: Optional[float] = None
    ars_override: Optional[float] = None
    isr_override: Optional[float] = None
    
    # Access
    user_id: Optional[str] = None  # Link to system user account
    
    # Notes
    notes: Optional[str] = None


class Employee(BaseModel):
    employee_id: str
    company_id: str
    
    # Personal Info
    first_name: str
    last_name: str
    full_name: str  # Computed
    email: str
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    date_of_birth: Optional[str] = None
    national_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    profile_photo: Optional[str] = None
    
    # Employment Info
    employee_number: Optional[str] = None  # Auto-generated
    job_title: str
    job_role_id: Optional[str] = None  # FK to job_postings for role catalog
    department_id: Optional[str] = None  # FK to departments collection
    department: Optional[str] = None  # Legacy string (auto-sync from department_id)
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    is_manager: bool = False  # Flag for org chart hierarchy
    hire_date: str
    termination_date: Optional[str] = None
    contract_type: ContractType = ContractType.FULL_TIME
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    
    # Compensation
    base_salary: float
    payment_frequency: PaymentFrequency = PaymentFrequency.BIWEEKLY
    currency: str = "DOP"
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_type: Optional[str] = None
    routing_number: Optional[str] = None  # SWIFT, BIC, or routing number
    
    # Benefits & Deductions
    has_health_insurance: bool = True
    has_pension: bool = True
    afp_provider: Optional[str] = None
    ars_provider: Optional[str] = None
    
    # Vacation tracking
    vacation_days_entitled: float = 14.0  # Default RD
    vacation_days_used: float = 0.0
    vacation_days_available: float = 14.0
    
    # Loan tracking
    active_loan_balance: float = 0.0
    
    # Access
    user_id: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None
    
    # Metadata
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None


class EmployeeUpdate(BaseModel):
    # Personal Info
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    date_of_birth: Optional[str] = None
    national_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    profile_photo: Optional[str] = None
    
    # Employment Info
    job_title: Optional[str] = None
    job_role_id: Optional[str] = None
    department_id: Optional[str] = None
    department: Optional[str] = None
    cost_center_id: Optional[str] = None
    manager_id: Optional[str] = None
    is_manager: Optional[bool] = None
    hire_date: Optional[str] = None
    contract_type: Optional[ContractType] = None
    status: Optional[EmployeeStatus] = None
    termination_date: Optional[str] = None
    
    # Compensation
    base_salary: Optional[float] = None
    payment_frequency: Optional[PaymentFrequency] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_type: Optional[str] = None
    
    # Variable Pay Configuration
    commission_rate: Optional[float] = None  # % commission on sales
    incentive_pool_percentage: Optional[float] = None  # % share of incentive pool
    overtime_payment_type: Optional[str] = None  # with_payroll, separate
    overtime_payment_day: Optional[int] = None
    commission_payment_type: Optional[str] = None  # with_payroll, separate, not_applicable
    commission_payment_day: Optional[int] = None
    bonus_payment_type: Optional[str] = None
    bonus_payment_day: Optional[int] = None
    incentive_payment_type: Optional[str] = None
    incentive_payment_day: Optional[int] = None
    
    # Benefits
    has_health_insurance: Optional[bool] = None
    has_pension: Optional[bool] = None
    has_isr: Optional[bool] = None
    afp_provider: Optional[str] = None
    ars_provider: Optional[str] = None
    # Manual deduction overrides (set to null/0 to clear)
    afp_override: Optional[float] = None
    ars_override: Optional[float] = None
    isr_override: Optional[float] = None
    base_salary_basis: Optional[str] = None  # how base_salary is expressed: "monthly", "biweekly", "weekly"
    currency: Optional[str] = None
    weekly_hours_regular: Optional[float] = None  # Field staged for future use (Time Clock module)
    
    # Allowances
    has_lunch_allowance: Optional[bool] = None
    lunch_allowance_amount: Optional[float] = None
    has_transport_allowance: Optional[bool] = None
    transport_allowance_amount: Optional[float] = None
    has_phone_allowance: Optional[bool] = None
    phone_allowance_amount: Optional[float] = None
    has_fuel_allowance: Optional[bool] = None
    fuel_allowance_amount: Optional[float] = None
    
    # Access
    user_id: Optional[str] = None
    
    notes: Optional[str] = None


# ==================== SALARY CHANGES ====================

class SalaryChangeCreate(BaseModel):
    employee_id: Optional[str] = None  # ignored; path param wins
    previous_salary: Optional[float] = None  # if omitted, derived from current employee.base_salary
    new_salary: float
    effective_date: str
    reason: str  # promotion, annual_review, adjustment, etc.
    notes: Optional[str] = None


class SalaryChange(BaseModel):
    change_id: str
    company_id: str
    employee_id: str
    employee_name: str
    previous_salary: float
    new_salary: float
    change_percentage: float
    effective_date: str
    reason: str
    notes: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime


# ==================== DOCUMENTS ====================

class EmployeeDocumentCreate(BaseModel):
    employee_id: str
    document_type: str  # contract, id_copy, resume, certificate, etc.
    name: str
    file_url: str
    expiry_date: Optional[str] = None
    notes: Optional[str] = None


class EmployeeDocument(BaseModel):
    document_id: str
    company_id: str
    employee_id: str
    document_type: str
    name: str
    file_url: str
    expiry_date: Optional[str] = None
    notes: Optional[str] = None
    uploaded_by: Optional[str] = None
    created_at: datetime


# ==================== PAYROLL CONFIG ====================

class PayrollConfigCreate(BaseModel):
    payment_frequency: PaymentFrequency = PaymentFrequency.BIWEEKLY
    payment_day_1: int = 15  # First payment day of month
    payment_day_2: int = 30  # Second payment day (for biweekly)
    
    # RD Legal Deductions (percentages)
    afp_employee_rate: float = 2.87  # Employee contribution
    afp_employer_rate: float = 7.10  # Employer contribution
    ars_employee_rate: float = 3.04  # Employee contribution
    ars_employer_rate: float = 7.09  # Employer contribution
    srl_rate: float = 1.20  # Seguro de Riesgos Laborales (employer only)
    infotep_rate: float = 1.0  # INFOTEP (employer only)
    
    # ISR brackets (simplified)
    isr_enabled: bool = True
    
    # Overtime rates - multi-country friendly (defaults shown apply to DR)
    overtime_rate_35: float = 1.35   # Hora extra normal (Mon-Sat after regular shift)
    overtime_rate_night: float = 1.15  # Trabajo nocturno (15% extra - DR 9pm-7am)
    overtime_rate_holiday: float = 2.0  # Día feriado / domingo (100% extra)
    overtime_rate_100: float = 2.0   # Hora extra al 100% (>68 hrs/semana RD)
    overtime_hours_per_month: float = 192.0  # Hours used to derive hourly rate from monthly salary
    overtime_strict_shortfall: bool = True  # STRICT: partial workdays (worked < base) deduct from OT. LENIENT: only marked days-off/vacations count.
    
    # Country code for OT rate defaults & labels (ISO-2). Falls back to company.country.
    country_code: Optional[str] = None  # e.g. "DO", "MX", "CO", "US"
    
    # Other settings
    include_regalia: bool = True  # Christmas bonus
    regalia_months: int = 12  # Months to calculate regalia


class PayrollConfig(BaseModel):
    config_id: str
    company_id: str
    payment_frequency: PaymentFrequency
    payment_day_1: int
    payment_day_2: int
    
    # Deduction rates
    afp_employee_rate: float
    afp_employer_rate: float
    ars_employee_rate: float
    ars_employer_rate: float
    srl_rate: float
    infotep_rate: float
    isr_enabled: bool
    
    # Overtime
    overtime_rate_35: float = 1.35
    overtime_rate_night: float = 1.15
    overtime_rate_holiday: float = 2.0
    overtime_rate_100: float = 2.0
    overtime_hours_per_month: float = 192.0
    country_code: Optional[str] = None
    
    # Other
    include_regalia: bool
    regalia_months: int
    
    created_at: datetime
    updated_at: datetime


# ==================== PREDEFINED COST CENTER TEMPLATES ====================

COST_CENTER_TEMPLATES = [
    {
        "name": "Marketing Interno",
        "code": "MKT",
        "description": "Gastos de marketing y publicidad propia",
        "is_system": True
    },
    {
        "name": "Administración General",
        "code": "ADM",
        "description": "Gastos administrativos y generales (G&A)",
        "is_system": True
    },
    {
        "name": "Tecnología / IT",
        "code": "IT",
        "description": "Infraestructura, software, desarrollo",
        "is_system": True
    },
    {
        "name": "Recursos Humanos",
        "code": "RRHH",
        "description": "Reclutamiento, capacitación, bienestar",
        "is_system": True
    },
    {
        "name": "Operaciones",
        "code": "OPS",
        "description": "Logística, mantenimiento, día a día",
        "is_system": True
    },
    {
        "name": "Ventas",
        "code": "VTA",
        "description": "Comisiones, viajes, adquisición de clientes",
        "is_system": True
    },
    {
        "name": "Instalaciones",
        "code": "FAC",
        "description": "Renta, servicios, seguridad",
        "is_system": True
    }
]


# ==================== RD LEGAL CONSTANTS ====================

# Country-specific overtime rate defaults (multipliers of the regular hourly rate)
# Used when initializing PayrollConfig based on the company's country.
COUNTRY_OVERTIME_DEFAULTS = {
    # Dominican Republic (Código de Trabajo Art. 203-204)
    "DO": {"overtime_rate_35": 1.35, "overtime_rate_night": 1.15, "overtime_rate_holiday": 2.0, "overtime_rate_100": 2.0, "overtime_hours_per_month": 192.0},
    # Mexico (LFT Art. 67-68: dobles primeras 9h, triples después)
    "MX": {"overtime_rate_35": 2.0, "overtime_rate_night": 1.25, "overtime_rate_holiday": 3.0, "overtime_rate_100": 3.0, "overtime_hours_per_month": 192.0},
    # Colombia (CST Art. 168: nocturna +35%, dominical +75%, recargo extra)
    "CO": {"overtime_rate_35": 1.25, "overtime_rate_night": 1.35, "overtime_rate_holiday": 1.75, "overtime_rate_100": 1.75, "overtime_hours_per_month": 240.0},
    # USA (FLSA: 1.5x after 40h; varies by state)
    "US": {"overtime_rate_35": 1.5, "overtime_rate_night": 1.0, "overtime_rate_holiday": 1.5, "overtime_rate_100": 2.0, "overtime_hours_per_month": 173.0},
    # Spain (Estatuto trabajadores Art. 35)
    "ES": {"overtime_rate_35": 1.5, "overtime_rate_night": 1.25, "overtime_rate_holiday": 1.75, "overtime_rate_100": 1.75, "overtime_hours_per_month": 165.0},
    # Puerto Rico
    "PR": {"overtime_rate_35": 1.5, "overtime_rate_night": 1.0, "overtime_rate_holiday": 2.0, "overtime_rate_100": 2.0, "overtime_hours_per_month": 173.0},
    # Argentina (LCT)
    "AR": {"overtime_rate_35": 1.5, "overtime_rate_night": 1.0, "overtime_rate_holiday": 2.0, "overtime_rate_100": 2.0, "overtime_hours_per_month": 192.0},
    # Chile
    "CL": {"overtime_rate_35": 1.5, "overtime_rate_night": 1.0, "overtime_rate_holiday": 1.5, "overtime_rate_100": 2.0, "overtime_hours_per_month": 180.0},
    # Peru
    "PE": {"overtime_rate_35": 1.25, "overtime_rate_night": 1.35, "overtime_rate_holiday": 2.0, "overtime_rate_100": 1.35, "overtime_hours_per_month": 192.0},
    # Generic / fallback
    "default": {"overtime_rate_35": 1.5, "overtime_rate_night": 1.15, "overtime_rate_holiday": 2.0, "overtime_rate_100": 2.0, "overtime_hours_per_month": 192.0},
}


def get_country_overtime_defaults(country_code: Optional[str]) -> dict:
    """Returns OT rate defaults for the given country code; falls back to 'default'."""
    if not country_code:
        return COUNTRY_OVERTIME_DEFAULTS["default"]
    return COUNTRY_OVERTIME_DEFAULTS.get(country_code.upper(), COUNTRY_OVERTIME_DEFAULTS["default"])


# ISR Brackets 2024 (Dominican Republic)
ISR_BRACKETS_RD = [
    {"min": 0, "max": 416220, "rate": 0, "base": 0},
    {"min": 416220.01, "max": 624329, "rate": 0.15, "base": 0},
    {"min": 624329.01, "max": 867123, "rate": 0.20, "base": 31216.35},
    {"min": 867123.01, "max": float('inf'), "rate": 0.25, "base": 79775.15},
]

# Salary cap for TSS contributions (20 minimum salaries)
TSS_SALARY_CAP_MULTIPLIER = 20

# AFP Providers in RD
AFP_PROVIDERS = [
    "AFP Popular",
    "AFP Reservas",
    "AFP Siembra",
    "AFP Crecer",
    "AFP Romana"
]

# ARS Providers in RD
ARS_PROVIDERS = [
    "ARS Humano",
    "ARS Universal",
    "ARS Palic",
    "ARS Semma",
    "ARS Meta Salud",
    "ARS Monumental",
    "SeNaSa"
]

# Banks in RD for payroll
BANKS_RD = [
    "Banco Popular Dominicano",
    "Banco de Reservas",
    "Banco BHD León",
    "Scotiabank",
    "Banco Santa Cruz",
    "Banco Promerica",
    "Asociación Popular",
    "Banco Caribe",
    "Banesco",
    "Citibank"
]


# ==================== PAYROLL MODELS ====================

class PayrollStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PROCESSING = "processing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PayrollPeriodCreate(BaseModel):
    period_name: Optional[str] = None  # Optional: auto-generated if missing
    period_type: PaymentFrequency = PaymentFrequency.BIWEEKLY
    start_date: str
    end_date: str
    payment_date: str
    notes: Optional[str] = None
    # NEW: payroll classification
    # "regular" = salario base + OT incluidas (default behavior)
    # "overtime_only" = solo paga horas extras aprobadas (sin salario base, sin AFP/ARS/ISR)
    # "salary_only" = solo paga salario base + deducciones legales (sin OT, sin bonos, sin incentivos)
    payment_kind: str = "regular"
    # NEW: When creating, the IDs of approved overtime requests to include in this period.
    # Defaults to ALL approved/unpaid OTs in date range when omitted.
    include_overtime_ids: Optional[List[str]] = None
    # If False, OTs in range are NOT auto-included (deferred to a separate OT period).
    auto_include_overtime: bool = True


class PayrollPeriod(BaseModel):
    period_id: str
    company_id: str
    period_name: str
    period_type: PaymentFrequency
    payment_kind: str = "regular"  # "regular", "overtime_only" or "salary_only"
    start_date: str
    end_date: str
    payment_date: str
    status: PayrollStatus = PayrollStatus.DRAFT
    
    # Totals
    total_employees: int = 0
    total_gross: float = 0.0
    total_deductions: float = 0.0
    total_net: float = 0.0
    total_employer_cost: float = 0.0  # Including employer contributions
    
    notes: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class PayrollEntryCreate(BaseModel):
    employee_id: str
    # Earnings
    base_salary: float = 0.0
    overtime_hours_35: float = 0.0  # Normal overtime hours
    overtime_hours_100: float = 0.0  # Holiday/night overtime hours
    bonus: float = 0.0
    commission: float = 0.0
    other_earnings: float = 0.0
    other_earnings_description: Optional[str] = None
    
    # Deductions (manual overrides)
    loan_deduction: float = 0.0
    other_deductions: float = 0.0
    other_deductions_description: Optional[str] = None
    
    notes: Optional[str] = None


class PayrollEntry(BaseModel):
    entry_id: str
    period_id: str
    company_id: str
    employee_id: str
    employee_name: str
    employee_number: Optional[str] = None
    department: Optional[str] = None
    
    # Cost Center tracking - payroll costs are distributed to employee's department CC
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    
    # Earnings
    base_salary: float = 0.0
    overtime_hours_35: float = 0.0
    overtime_amount_35: float = 0.0
    overtime_hours_night: float = 0.0
    overtime_amount_night: float = 0.0
    overtime_hours_holiday: float = 0.0
    overtime_amount_holiday: float = 0.0
    overtime_hours_100: float = 0.0
    overtime_amount_100: float = 0.0
    bonus: float = 0.0
    commission: float = 0.0
    other_earnings: float = 0.0
    other_earnings_description: Optional[str] = None
    gross_salary: float = 0.0
    
    # Employee Deductions
    afp_employee: float = 0.0
    ars_employee: float = 0.0
    isr: float = 0.0
    loan_deduction: float = 0.0
    loan_id: Optional[str] = None
    other_deductions: float = 0.0
    other_deductions_description: Optional[str] = None
    # NEW: structured list of biweekly extra deductions with reasons
    # Each item: {"id": str, "amount": float, "reason": str}
    extra_deductions: List[Dict[str, Any]] = []
    total_deductions: float = 0.0
    
    # Net Pay
    net_salary: float = 0.0
    
    # Employer Contributions (for reporting)
    afp_employer: float = 0.0
    ars_employer: float = 0.0
    srl_employer: float = 0.0
    infotep_employer: float = 0.0
    total_employer_cost: float = 0.0
    
    # Bank info for payment
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PayrollEntryUpdate(BaseModel):
    overtime_hours_35: Optional[float] = None
    overtime_hours_night: Optional[float] = None
    overtime_hours_holiday: Optional[float] = None
    overtime_hours_100: Optional[float] = None
    bonus: Optional[float] = None
    commission: Optional[float] = None
    other_earnings: Optional[float] = None
    other_earnings_description: Optional[str] = None
    loan_deduction: Optional[float] = None
    other_deductions: Optional[float] = None
    other_deductions_description: Optional[str] = None
    extra_deductions: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None


class PayslipData(BaseModel):
    """Data structure for generating a payslip/receipt"""
    entry: PayrollEntry
    period: PayrollPeriod
    company_name: str
    company_rnc: Optional[str] = None
    employee_national_id: Optional[str] = None
    afp_provider: Optional[str] = None
    ars_provider: Optional[str] = None


class BankFileEntry(BaseModel):
    """Entry for bank payment file"""
    employee_name: str
    bank_name: str
    bank_account: str
    amount: float
    reference: str  # Period ID or custom reference


# ISR Calculation Helper (Dominican Republic 2024)
def calculate_isr_rd(annual_salary: float) -> float:
    """Calculate ISR based on Dominican Republic tax brackets"""
    if annual_salary <= 416220:
        return 0
    elif annual_salary <= 624329:
        return (annual_salary - 416220) * 0.15
    elif annual_salary <= 867123:
        return 31216.35 + (annual_salary - 624329) * 0.20
    else:
        return 79775.15 + (annual_salary - 867123) * 0.25


def calculate_monthly_isr(monthly_salary: float) -> float:
    """Calculate monthly ISR from monthly salary"""
    annual_salary = monthly_salary * 12
    annual_isr = calculate_isr_rd(annual_salary)
    return annual_isr / 12




# ==================== BENEFITS / COMPENSACIÓN ====================

class BenefitType(str, Enum):
    LUNCH_ALLOWANCE = "lunch_allowance"  # Subsidio de almuerzo
    TRANSPORT_ALLOWANCE = "transport_allowance"  # Subsidio de transporte
    PHONE_ALLOWANCE = "phone_allowance"  # Subsidio de teléfono
    FUEL_ALLOWANCE = "fuel_allowance"  # Subsidio de combustible
    HEALTH_INSURANCE_EXTRA = "health_insurance_extra"  # Seguro médico adicional
    LIFE_INSURANCE = "life_insurance"  # Seguro de vida
    GYM_ALLOWANCE = "gym_allowance"  # Gimnasio
    EDUCATION_ALLOWANCE = "education_allowance"  # Educación
    OTHER = "other"


class BenefitFrequency(str, Enum):
    MONTHLY = "monthly"
    BIWEEKLY = "biweekly"
    DAILY = "daily"  # For lunch vouchers per day worked
    ONE_TIME = "one_time"


class EmployeeBenefitCreate(BaseModel):
    employee_id: str
    benefit_type: BenefitType
    name: str  # Display name
    amount: float
    frequency: BenefitFrequency = BenefitFrequency.MONTHLY
    is_taxable: bool = False  # Subject to ISR
    is_deduction: bool = False  # True if deducted from salary (e.g., parking)
    effective_date: str
    end_date: Optional[str] = None
    notes: Optional[str] = None


class EmployeeBenefit(BaseModel):
    benefit_id: str
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None
    benefit_type: BenefitType
    name: str
    amount: float
    frequency: BenefitFrequency
    is_taxable: bool
    is_deduction: bool
    is_active: bool = True
    effective_date: str
    end_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ==================== TIME & ATTENDANCE ====================

class TimeOffType(str, Enum):
    VACATION = "vacation"  # Vacaciones
    SICK_LEAVE = "sick_leave"  # Licencia médica
    PERSONAL_LEAVE = "personal_leave"  # Permiso personal
    MATERNITY = "maternity"  # Licencia de maternidad
    PATERNITY = "paternity"  # Licencia de paternidad
    BEREAVEMENT = "bereavement"  # Duelo
    UNPAID_LEAVE = "unpaid_leave"  # Licencia sin sueldo
    HOLIDAY = "holiday"  # Feriado (system-generated)
    OTHER = "other"


class TimeOffStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class TimeOffRequestCreate(BaseModel):
    employee_id: str
    time_off_type: TimeOffType
    start_date: str
    end_date: str
    total_days: float  # Can be half days
    reason: Optional[str] = None
    notes: Optional[str] = None


class TimeOffRequest(BaseModel):
    request_id: str
    company_id: str
    employee_id: str
    employee_name: str
    time_off_type: TimeOffType
    start_date: str
    end_date: str
    total_days: float
    status: TimeOffStatus = TimeOffStatus.PENDING
    reason: Optional[str] = None
    notes: Optional[str] = None
    
    # Approval info
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime


class TimeOffBalance(BaseModel):
    employee_id: str
    employee_name: str
    year: int
    vacation_entitled: float = 14.0  # RD default
    vacation_used: float = 0.0
    vacation_pending: float = 0.0  # Pending approval
    vacation_available: float = 14.0
    sick_leave_used: float = 0.0
    personal_leave_used: float = 0.0


# ==================== OVERTIME / HORAS EXTRAS ====================

class OvertimeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"  # Already included in payroll


class OvertimeRequestCreate(BaseModel):
    employee_id: str
    date: str
    hours_35: float = 0.0  # Hora extra normal (35% extra)
    hours_night: float = 0.0  # Trabajo nocturno (15% extra)
    hours_holiday: float = 0.0  # Día feriado / domingo (100% extra)
    hours_100: float = 0.0  # Hora extra al 100% (>68 hrs/semana)
    reason: str
    notes: Optional[str] = None


class OvertimeRequest(BaseModel):
    overtime_id: str
    company_id: str
    employee_id: str
    employee_name: str
    date: str
    hours_35: float = 0.0
    hours_night: float = 0.0
    hours_holiday: float = 0.0
    hours_100: float = 0.0
    total_hours: float
    estimated_amount: float  # Calculated based on hourly rate
    status: OvertimeStatus = OvertimeStatus.PENDING
    reason: str
    notes: Optional[str] = None
    
    # Approval
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    # Payroll linkage
    payroll_period_id: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime


# ==================== LOANS & ADVANCES / PRÉSTAMOS ====================

class LoanType(str, Enum):
    PERSONAL_LOAN = "personal_loan"  # Préstamo personal
    SALARY_ADVANCE = "salary_advance"  # Adelanto de salario
    EMERGENCY_LOAN = "emergency_loan"  # Préstamo de emergencia
    EDUCATION_LOAN = "education_loan"  # Préstamo educativo


class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"  # Being deducted
    PAID_OFF = "paid_off"
    CANCELLED = "cancelled"


class LoanRequestCreate(BaseModel):
    employee_id: str
    loan_type: LoanType
    requested_amount: float
    installments: int  # Number of payroll periods to deduct
    reason: str
    notes: Optional[str] = None


class Loan(BaseModel):
    loan_id: str
    company_id: str
    employee_id: str
    employee_name: str
    loan_type: LoanType
    requested_amount: float
    approved_amount: float = 0.0
    installments: int
    installment_amount: float = 0.0  # Amount per payroll period
    total_paid: float = 0.0
    remaining_balance: float = 0.0
    installments_paid: int = 0
    status: LoanStatus = LoanStatus.PENDING
    reason: str
    notes: Optional[str] = None
    
    # Approval
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    # Dates
    start_date: Optional[str] = None  # When deductions start
    end_date: Optional[str] = None  # Expected end date
    
    created_at: datetime
    updated_at: datetime


class LoanPayment(BaseModel):
    payment_id: str
    loan_id: str
    company_id: str
    employee_id: str
    payroll_period_id: str
    amount: float
    payment_date: str
    remaining_balance_after: float
    notes: Optional[str] = None
    created_at: datetime


# ==================== OFFBOARDING / TERMINACIÓN ====================

class TerminationType(str, Enum):
    RESIGNATION = "resignation"  # Renuncia voluntaria
    DISMISSAL_JUSTIFIED = "dismissal_justified"  # Despido justificado (con causa)
    DISMISSAL_UNJUSTIFIED = "dismissal_unjustified"  # Despido injustificado (sin causa)
    MUTUAL_AGREEMENT = "mutual_agreement"  # Mutuo acuerdo
    CONTRACT_END = "contract_end"  # Fin de contrato
    RETIREMENT = "retirement"  # Jubilación
    DEATH = "death"  # Fallecimiento


class OffboardingStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PROCESSED = "processed"
    CANCELLED = "cancelled"


class OffboardingCreate(BaseModel):
    employee_id: str
    termination_type: TerminationType
    termination_date: str
    last_working_day: str
    reason: str
    notes: Optional[str] = None


class Offboarding(BaseModel):
    offboarding_id: str
    company_id: str
    employee_id: str
    employee_name: str
    employee_number: Optional[str] = None
    
    # Termination Info
    termination_type: TerminationType
    termination_date: str
    last_working_day: str
    hire_date: str
    years_of_service: float
    reason: str
    notes: Optional[str] = None
    status: OffboardingStatus = OffboardingStatus.DRAFT
    
    # Liquidation Calculation (RD Labor Code)
    base_salary: float = 0.0
    daily_salary: float = 0.0
    
    # Preaviso (Notice Period) - Art. 76 CT
    preaviso_days: int = 0
    preaviso_amount: float = 0.0
    
    # Cesantía (Severance) - Art. 80 CT
    cesantia_days: int = 0
    cesantia_amount: float = 0.0
    
    # Vacaciones no disfrutadas
    vacation_days_owed: float = 0.0
    vacation_amount: float = 0.0
    
    # Proporción Regalía Pascual
    regalia_months_worked: int = 0
    regalia_proportion: float = 0.0
    
    # Salario pendiente
    pending_salary_days: int = 0
    pending_salary_amount: float = 0.0
    
    # Bonificaciones pendientes
    pending_bonuses: float = 0.0
    
    # Deducciones pendientes (préstamos, etc.)
    pending_deductions: float = 0.0
    deductions_detail: Optional[str] = None
    
    # Total
    gross_liquidation: float = 0.0
    total_deductions: float = 0.0
    net_liquidation: float = 0.0
    
    # Approval
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    
    created_at: datetime
    updated_at: datetime


# ==================== RD LABOR CODE CONSTANTS ====================

# Preaviso periods (Art. 76 Código de Trabajo RD)
PREAVISO_PERIODS_RD = [
    {"min_months": 3, "max_months": 6, "days": 7},
    {"min_months": 6, "max_months": 12, "days": 14},
    {"min_months": 12, "max_months": float('inf'), "days": 28},
]

# Cesantía calculation (Art. 80 Código de Trabajo RD)
CESANTIA_PERIODS_RD = [
    {"min_months": 3, "max_months": 6, "days_per_year": 6},
    {"min_months": 6, "max_months": 12, "days_per_year": 13},
    {"min_months": 12, "max_months": 60, "days_per_year": 21},  # Up to 5 years
    {"min_months": 60, "max_months": float('inf'), "days_per_year": 23},  # 5+ years
]

# Maximum cesantía cap
CESANTIA_MAX_DAYS = 630  # Maximum days for cesantía


def calculate_preaviso_days(months_worked: float) -> int:
    """Calculate preaviso days based on RD labor code"""
    for period in PREAVISO_PERIODS_RD:
        if period["min_months"] <= months_worked < period["max_months"]:
            return period["days"]
    return 28  # Default for 12+ months


def calculate_cesantia_days(months_worked: float) -> int:
    """Calculate cesantía days based on RD labor code"""
    if months_worked < 3:
        return 0
    
    years_worked = months_worked / 12
    total_days = 0
    
    # Calculate progressively
    if months_worked >= 3 and months_worked < 6:
        total_days = int(years_worked * 6)
    elif months_worked >= 6 and months_worked < 12:
        total_days = int(years_worked * 13)
    elif months_worked >= 12 and months_worked < 60:
        total_days = int(years_worked * 21)
    else:  # 5+ years
        total_days = int(years_worked * 23)
    
    return min(total_days, CESANTIA_MAX_DAYS)


def calculate_liquidation_rd(
    termination_type: TerminationType,
    hire_date: str,
    termination_date: str,
    base_salary: float,
    vacation_days_owed: float = 0,
    regalia_months_worked: int = 0,
    pending_salary_days: int = 0,
    pending_deductions: float = 0
) -> dict:
    """
    Calculate full liquidation based on Dominican Republic Labor Code.
    Returns detailed breakdown of all amounts.
    """
    from datetime import datetime as dt
    
    hire_dt = dt.fromisoformat(hire_date)
    term_dt = dt.fromisoformat(termination_date)
    
    # Calculate service time
    delta = term_dt - hire_dt
    months_worked = delta.days / 30.44  # Average days per month
    years_worked = months_worked / 12
    
    # Daily salary (monthly / 23.83 working days)
    daily_salary = base_salary / 23.83
    
    result = {
        "years_of_service": round(years_worked, 2),
        "months_worked": round(months_worked, 1),
        "daily_salary": round(daily_salary, 2),
        "preaviso_days": 0,
        "preaviso_amount": 0,
        "cesantia_days": 0,
        "cesantia_amount": 0,
        "vacation_amount": 0,
        "regalia_proportion": 0,
        "pending_salary_amount": 0,
        "gross_liquidation": 0,
        "total_deductions": pending_deductions,
        "net_liquidation": 0,
        "breakdown": []
    }
    
    # Preaviso & Cesantía only apply for unjustified dismissal
    if termination_type == TerminationType.DISMISSAL_UNJUSTIFIED:
        # Preaviso
        preaviso_days = calculate_preaviso_days(months_worked)
        preaviso_amount = preaviso_days * daily_salary
        result["preaviso_days"] = preaviso_days
        result["preaviso_amount"] = round(preaviso_amount, 2)
        result["breakdown"].append(f"Preaviso ({preaviso_days} días): ${preaviso_amount:,.2f}")
        
        # Cesantía
        cesantia_days = calculate_cesantia_days(months_worked)
        cesantia_amount = cesantia_days * daily_salary
        result["cesantia_days"] = cesantia_days
        result["cesantia_amount"] = round(cesantia_amount, 2)
        result["breakdown"].append(f"Cesantía ({cesantia_days} días): ${cesantia_amount:,.2f}")
    
    # Vacaciones no disfrutadas (applies to all termination types)
    vacation_amount = vacation_days_owed * daily_salary
    result["vacation_amount"] = round(vacation_amount, 2)
    if vacation_days_owed > 0:
        result["breakdown"].append(f"Vacaciones ({vacation_days_owed} días): ${vacation_amount:,.2f}")
    
    # Proporción de Regalía Pascual (applies to all)
    if regalia_months_worked > 0:
        regalia_proportion = (base_salary / 12) * regalia_months_worked
        result["regalia_proportion"] = round(regalia_proportion, 2)
        result["breakdown"].append(f"Regalía proporcional ({regalia_months_worked} meses): ${regalia_proportion:,.2f}")
    
    # Salario pendiente
    pending_salary_amount = pending_salary_days * daily_salary
    result["pending_salary_amount"] = round(pending_salary_amount, 2)
    if pending_salary_days > 0:
        result["breakdown"].append(f"Salario pendiente ({pending_salary_days} días): ${pending_salary_amount:,.2f}")
    
    # Calculate totals
    result["gross_liquidation"] = round(
        result["preaviso_amount"] +
        result["cesantia_amount"] +
        result["vacation_amount"] +
        result["regalia_proportion"] +
        result["pending_salary_amount"],
        2
    )
    
    result["net_liquidation"] = round(
        result["gross_liquidation"] - result["total_deductions"],
        2
    )
    
    if pending_deductions > 0:
        result["breakdown"].append(f"(-) Deducciones pendientes: -${pending_deductions:,.2f}")
    
    result["breakdown"].append(f"TOTAL NETO: ${result['net_liquidation']:,.2f}")
    
    return result
