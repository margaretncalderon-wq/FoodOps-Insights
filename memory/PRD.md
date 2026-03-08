# Kora ERP - Product Requirements Document

## Overview
Comprehensive ERP application for event management agencies with modules for People Ops, Finance, Culinary Intelligence, and Business Intelligence.

## Core Modules
- **System Pulse**: Dashboard with real-time system state
- **Client Engagement**: CRM and lead management
- **Program Orchestration**: Event planning and coordination
- **Execution Hub**: Operational goals and task tracking
- **Demand Generation**: Marketing campaigns and brand hub
- **Partners**: Vendor and partner management with capabilities
- **Business Clarity**: Financial reporting, invoices, ITBIS
- **People Ops**: HR, payroll, employee management
- **Culinary Intelligence**: Recipes, inventory, food costing
- **Settings**: System configuration

## Completed Features (March 2026)

### Expense Categories System (March 8, 2026)
- **Renamed**: "Fixed Costs & Budget" → "Expense Categories & Budgets"
- **New Fields**:
  - `category_type`: Variable / Operating / Investment
  - `target_percent`: Target as % of revenue (e.g., Food Cost 30%)
- **UI Enhancements**:
  - Summary cards by expense type (Variable, Operating, Investment)
  - New category form with type selector and target % input
  - Updated table with Type and Target % columns
- **Backend**: New alias endpoints `/expense-categories/*` alongside existing `/fixed-costs/*`
- **Backward Compatible**: All existing data continues to work (defaults to "operating" type)

### Organization Structure Module (March 8, 2026)
- **New Departments Layer**: Created `departments` collection as primary organizational grouping
- **Cost Centers Enhancement**: Extended with `department_id` foreign key
- **Employee Linking**: Added `department_id` to employees model
- **Settings UI**: New "Organization Structure" section in Settings > Finance
  - Department CRUD with code, head, parent department
  - Cost Center CRUD with department, type, budget, owner
  - Delete Cost Centers with usage warning (soft delete if has transactions)
- **Org Chart Visualization**: New "Org Chart" tab in People Ops module
  - Manager-based hierarchy view
  - Department-based grouping view
- **Bug Fix**: Fixed blank screen when opening "Add Department" / "Add Cost Center" modals
  - Root cause: Select components needed controlled values with fallback to "none"
- **Architecture Cleanup**: Removed duplicate "Cost Centers" tab from Settings > Finance
  - Settings > Org Structure = ONLY place to create/configure Cost Centers (structure)
  - Business Clarity > CC Budgets = ONLY place to manage budgets and analyze (operations)
- **Employee Form Enhancement** (March 8, 2026):
  - Job Role dropdown (pulls from Recruitment > Job Postings)
  - Department dropdown (pulls from Settings > Org Structure)
  - "Reports To" dropdown (select manager)
  - "Is Manager" checkbox (for org chart hierarchy)
  - Added `is_manager`, `job_role_id`, `department_id` to employee model

### Payment Recording Flow (March 8, 2026)
- **Bug Fix**: Fixed critical bug preventing modal from advancing to Step 2 after client selection
- Multi-step payment workflow:
  - Step 1: Select client
  - Step 2: Select invoices/orders to apply payment
  - Step 3: Enter payment details (date, method, reference, notes)
- Automatic invoice balance update upon payment
- Payment receipt generation with company branding

### Data Migration Module
- CSV import for clients, suppliers, sales, inventory
- Robust header normalization (multiple formats supported)
- Special character handling with `re.escape()`
- Date format support: DD/MM/AAAA, YYYY-MM-DD
- Field mapping for legacy data compatibility

### Financial Features
- ITBIS tax reports (Formato 606 & 607) with Excel export
- Enhanced Purchase Order receiving flow
- Invoice and expense Excel exports with date filters

### Shared Suppliers Module
- Single `db.suppliers` collection
- Accessible from Partners and Culinary Intelligence
- Field parity between suppliers and partners
- "Preferred Supplier" system with visual indicators

### Editable Partner Capabilities
- User-configurable capabilities list in Settings
- Stored in `db.partner_capabilities` collection

### Inventory Import Enhancement (March 8, 2026)
- Fixed field mapping: `unit_cost`→`cost_per_unit`, `current_stock`→`stock_quantity`, `min_stock`→`min_stock_level`
- Brand field support
- Products now visible in Culinary Intelligence UI

## Database Schema

### Key Collections
- `departments` (NEW): `{department_id, company_id, name, code, head_user_id, parent_department_id, is_active}`
- `cost_centers` (MODIFIED): Added `department_id` FK to departments
- `employees` (MODIFIED): Added `department_id` FK to departments (old `department` string field remains for migration)
- `suppliers`: Unified supplier data with `is_preferred` flag
- `partner_capabilities`: Custom capability definitions
- `ingredients`: Inventory items with `inventory_type`, `brand`
- `invoices`: Sales transactions
- `clients`: Customer data

## API Endpoints

### Data Migration
- `POST /api/migration/upload` - Upload CSV files
- `GET /api/migration/templates/{type}` - Download templates

### Inventory
- `GET /api/inventory` - Summary with field mapping
- `GET /api/inventory/ingredients` - List with filters
- `POST /api/inventory/ingredients` - Create item

### ITBIS
- `GET /api/itbis/format-606` - Generate 606 report
- `GET /api/itbis/format-607` - Generate 607 report
- `GET /api/itbis/export/{format}` - Export to Excel

## Credentials
- **Demo User**: demo.agency@kora.com / Evoque2024!

## Known Issues
- **P1**: Unstable user sessions - Sessions expire prematurely causing random logouts (recurring issue, needs investigation)
- Emergent LLM Key budget exhausted

## Upcoming Tasks (Prioritized)
1. **P1**: Fix unstable user sessions - Investigate token expiration and auth middleware
2. **P1**: Backfill `department_id` for existing employees - Migration script needed
3. **P2**: Enhance Business Clarity reports with Department grouping
4. **P2**: Staffdo.com Integration - Job posting sync
5. **P2**: Meta/TikTok social media integration
6. **P2**: Email marketing provider (Mailchimp/Brevo)
7. **P3**: Complete i18n implementation
8. **P3**: Kora Comms (WhatsApp)
9. **P4**: Setup wizard for new users

## Architecture
```
/app/
├── backend/
│   ├── routers/
│   │   ├── auth.py            # Authentication + finance setup wizard
│   │   ├── business_clarity.py # Financial reports, CC budgets
│   │   ├── people_ops.py      # Department CRUD, employee management
│   │   ├── migration.py       # Data import logic
│   │   ├── exports.py         # Excel exports
│   │   ├── itbis.py           # Tax reports
│   │   └── partners.py        # Partner/Supplier management
│   └── server.py              # Main API, model definitions
└── frontend/
    └── src/
        ├── components/
        │   ├── settings/
        │   │   └── OrganizationStructureSection.js  # Dept/CC management
        │   ├── ui/            # Shadcn components
        │   └── Shared/Suppliers/
        └── pages/
            ├── PeopleOps/
            │   └── OrgChart.js    # Org visualization
            ├── BusinessClarity/
            │   ├── PaymentsSection.js
            │   └── CostCenterBudgetsSection.js
            ├── FoodOps/       # Culinary Intelligence
            ├── Partners/      # Partner management
            └── Settings/      # Configuration pages
```
