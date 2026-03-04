# models/people_ops.py - People Operations / RRHH Models
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ==================== COST CENTERS ====================

class CostCenterCreate(BaseModel):
    name: str
    code: Optional[str] = None  # Accounting code
    description: Optional[str] = None
    annual_budget: Optional[float] = None
    responsible_user_id: Optional[str] = None
    is_active: bool = True
    is_system: bool = False  # True for predefined templates


class CostCenter(BaseModel):
    cost_center_id: str
    company_id: str
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    annual_budget: Optional[float] = None
    current_spend: float = 0.0  # Calculated from expenses
    responsible_user_id: Optional[str] = None
    responsible_name: Optional[str] = None
    is_active: bool = True
    is_system: bool = False
    created_at: datetime
    updated_at: datetime


class CostCenterUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    annual_budget: Optional[float] = None
    responsible_user_id: Optional[str] = None
    is_active: Optional[bool] = None


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
    department: Optional[str] = None
    cost_center_id: Optional[str] = None
    manager_id: Optional[str] = None  # Reports to
    hire_date: str
    contract_type: ContractType = ContractType.FULL_TIME
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    
    # Compensation
    base_salary: float
    payment_frequency: PaymentFrequency = PaymentFrequency.BIWEEKLY
    currency: str = "DOP"
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_type: Optional[str] = None  # savings, checking
    
    # Benefits & Deductions
    has_health_insurance: bool = True  # ARS
    has_pension: bool = True  # AFP
    afp_provider: Optional[str] = None
    ars_provider: Optional[str] = None
    
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
    department: Optional[str] = None
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
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
    department: Optional[str] = None
    cost_center_id: Optional[str] = None
    manager_id: Optional[str] = None
    contract_type: Optional[ContractType] = None
    status: Optional[EmployeeStatus] = None
    termination_date: Optional[str] = None
    
    # Compensation
    base_salary: Optional[float] = None
    payment_frequency: Optional[PaymentFrequency] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_account_type: Optional[str] = None
    
    # Benefits
    has_health_insurance: Optional[bool] = None
    has_pension: Optional[bool] = None
    afp_provider: Optional[str] = None
    ars_provider: Optional[str] = None
    
    # Access
    user_id: Optional[str] = None
    
    notes: Optional[str] = None


# ==================== SALARY CHANGES ====================

class SalaryChangeCreate(BaseModel):
    employee_id: str
    previous_salary: float
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
    
    # Overtime rates
    overtime_rate_35: float = 1.35  # Normal overtime (35% extra)
    overtime_rate_100: float = 2.0  # Holiday/night overtime (100% extra)
    
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
    overtime_rate_35: float
    overtime_rate_100: float
    
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
