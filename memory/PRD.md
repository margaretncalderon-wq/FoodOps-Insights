# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for:
- People Ops (HR management)
- Business Clarity (Financials)
- Recruitment
- Settings & Organization Structure

## User Personas
- **Admin/Owner**: Full access to all modules and configuration
- **Finance**: Access to Business Clarity and financial reports
- **HR**: Access to People Ops, limited payroll approval
- **Manager**: View-limited access to team in People Ops
- **Editor/Viewer**: Content and invoice management

## Core Requirements

### Organization Structure
- Departments and Cost Centers defined in Settings > Org Structure
- Hierarchical org chart visualization
- Safe delete mechanism for Cost Centers with dependency checks

### People Ops
- Employee management with comprehensive profiles
- Dropdowns for Job Role (sourced from Recruitment), Department, and Manager
- Banking Info section (international-friendly)
- Org chart based on reporting hierarchy

### Business Clarity
- **Expense Categories & Budgets**: Flexible system with types (Variable, Operating, Investment) and target percentages
- **Cost Center Budgets**: Automated calculation from linked Expense Categories
- Invoices, Payments, Receivables, Payables management
- Executive Dashboard with Profit Signals
- Stripe integration for payments

### Recruitment
- Job Postings serving as master source for Job Roles

## Tech Stack
- **Frontend**: React with Shadcn/UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Payments**: Stripe integration
- **Auth**: JWT-based authentication

## Key Data Models

### expense_categories (formerly fixed_cost_categories)
```json
{
  "category_id": "string",
  "name": "string",
  "category_type": "string (Variable|Operating|Investment)",
  "target_percent": "float",
  "cost_center_id": "string",
  "active": "boolean"
}
```

### employees
```json
{
  "employee_id": "string",
  "department_id": "string",
  "job_role_id": "string",
  "is_manager": "boolean",
  "manager_id": "string",
  "bank_name": "string",
  "bank_account_type": "string",
  "bank_account_number": "string",
  "bank_currency": "string",
  "bank_routing_number": "string"
}
```

### cost_centers
```json
{
  "cost_center_id": "string",
  "name": "string",
  "department_id": "string",
  "annual_budget": "number (deprecated - now calculated)"
}
```

## What's Been Implemented

### Session: March 2026

#### Completed
1. **Bug Fix (Org Structure)**: Resolved critical bug where adding new Department/Cost Center caused blank screen
2. **Budget Logic Refactoring**:
   - Consolidated three separate budget management areas
   - Removed manual budget entry from Settings > Org Structure
   - Automated CC budgets to calculate from linked Expense Categories
3. **Expense Management Enhancement**:
   - Transformed "Fixed Costs" into flexible "Expense Categories & Budgets"
   - Added Category Type and Target % fields
4. **People Ops Enhancement**:
   - Dropdowns for Job Role, Department, and Manager
   - Banking Info section for employee profiles
5. **Cost Centers Safe Delete**: Dependency checks before deletion
6. **UI/UX Cleanup**: Removed redundant UI, added navigation shortcuts

#### Verified Working (March 9, 2026)
- **CC Budgets Detail Panel**: Endpoint `/cost-centers/{cc_id}/budget-detail` working correctly
- Panel shows YTD Budget, YTD Actual, Variance, Monthly Breakdown
- Tested with multiple cost centers

## Known Issues

### P1 - High Priority
1. **Unstable User Sessions**: Random logouts disrupting workflows
   - Status: NOT STARTED
   - Location: `backend/routers/auth.py`
   - Recurrence: 3+ times in previous forks

### P1 - Data Migration
1. **Employee department_id backfill**: Script needed to populate from old `department` string field
   - Status: NOT STARTED
   - Critical for Org Chart data consistency

## Backlog / Future Tasks

### P2 - Improvements
- Enhance Business Clarity reports with Department grouping/filtering

### P3 - Integrations
- Staffdo.com API for recruitment
- Social Media APIs (Meta, TikTok)
- Email Marketing Provider
- Full UTM tracking

### P4 - Features
- Kora Comms Phase 1 (WhatsApp integration)
- Complete internationalization (i18n)
- Expand initial setup wizard

## 3rd Party Integrations
- **Active**: YouTube Data API, Stripe
- **Configured**: Emergent LLM Key (budget exhausted)
- **Available**: Zapier/Make webhooks
- **Planned**: Staffdo.com, Meta, TikTok, Mailchimp/Brevo

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Key Files Reference
- `backend/routers/business_clarity.py` - Main business logic
- `backend/routers/people_ops.py` - HR functions
- `backend/routers/auth.py` - Authentication (investigate for session issues)
- `frontend/src/components/business-clarity/CostCenterBudgetsSection.js` - CC Budgets UI
- `frontend/src/components/business-clarity/FixedCostsSection.js` - Expense Categories UI

## User Language Preference
Spanish (es) - All user communication should be in Spanish
