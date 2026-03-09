# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for:
- People Ops (HR management)
- Business Clarity (Financials)
- Recruitment
- Settings & Organization Structure
- Super Admin Panel for managing organizations and demo accounts

## User Personas
- **Super Admin**: Platform-level access for managing all organizations
- **Admin/Owner**: Full access to all modules and configuration within their org
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

### Super Admin Panel
- **Demo Accounts Management**: Create, edit, extend trial, convert to paid
- **Available Modules**: 
  - module_event_orchestration (Program Orchestration)
  - module_culinary_intelligence (Culinary Intelligence)
  - module_operations_supplies (Resource Management)
  - module_venues (Venues & Locations)
  - module_demand_studio (Demand Generation)
  - module_recruitment (Recruitment)
  - module_kora_comms (Kora Comms)

### Recruitment
- Job Postings serving as master source for Job Roles

## Tech Stack
- **Frontend**: React with Shadcn/UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Payments**: Stripe integration
- **Auth**: JWT-based authentication

## What's Been Implemented

### Session: March 9, 2026

#### Completed
1. **CC Budgets Detail Panel**: Verified working - shows YTD Budget, Actual, Variance, Monthly Breakdown
2. **Demo Accounts Edit Feature**: 
   - Added GET endpoint for account details
   - Added PUT endpoint for editing accounts
   - Added Edit modal in frontend with module selection
3. **Module List Sync**: Updated frontend AVAILABLE_MODULES to match backend
4. **Module Creation Fix**: Modules now create without requiring addon_definitions

#### Previously Completed
- Bug Fix (Org Structure): Resolved critical bug with blank screen
- Budget Logic Refactoring: Consolidated and automated CC budgets
- Expense Management Enhancement: Flexible categories with types
- People Ops Enhancement: Dropdowns and Banking Info
- Cost Centers Safe Delete

## Known Issues

### P1 - High Priority
1. **Unstable User Sessions**: Random logouts disrupting workflows
   - Status: NOT STARTED
   - Location: `backend/routers/auth.py`
   - Recurrence: 3+ times in previous forks

### P1 - Data Migration
1. **Employee department_id backfill**: Script needed
   - Status: NOT STARTED

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

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Key Files Reference
- `backend/server.py` - Super admin endpoints (lines ~16500-17000)
- `backend/routers/business_clarity.py` - Financial logic
- `backend/routers/auth.py` - Authentication (investigate for session issues)
- `frontend/src/pages/super-admin/DemoAccountsPage.js` - Demo accounts UI
- `frontend/src/components/business-clarity/CostCenterBudgetsSection.js` - CC Budgets UI

## User Language Preference
Spanish (es) - All user communication should be in Spanish
