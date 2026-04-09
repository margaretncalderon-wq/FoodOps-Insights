# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for:
- People Ops (HR management)
- Business Clarity (Financials)
- Recruitment
- Settings & Organization Structure
- Super Admin Panel for managing organizations and demo accounts
- Demand Studio (Social Media & Marketing)
- CRM / Client Engagement
- Partners

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
- Org chart based on reporting hierarchy
- Hire flow from Recruitment to Employee creation

### Business Clarity
- Expense Categories & Budgets
- Cost Center Budgets
- Invoices, Payments, Receivables, Payables
- Executive Dashboard with Profit Signals
- Stripe integration

### Super Admin Panel
- Demo Accounts Management
- Module Filtering, Pricing, Kora Core Configuration

### Demand Studio
- Social media post management with rich text editor
- Content Pillars, Audiences, Campaigns
- Calendar and Queue views with format indicators
- Social account CRUD

### CRM / Client Engagement
- Intelligent lead conversion: 3 modes (Solo Cliente, Cliente+Evento Existente, Cliente+Evento Nuevo)
- Lead Sources catalog with auto-seeded defaults
- CSV Import with configurable lead_type and source, company deduplication
- Sales Reports with daily activity, weekly goals, team notifications
- Leads by source report
- **List view**: A-Z sort by name, group by company/status, Source column with colored badges
- **Visual distinction**: Company-only leads (blue, "Solo empresa"), person leads (violet icon)
- **Kanban view**: Drag-and-drop pipeline with configurable stages

## Tech Stack
- **Frontend**: React with Shadcn/UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Payments**: Stripe integration
- **Auth**: JWT-based authentication

## What's Been Implemented

### Session: April 9, 2026 (Part 2)

#### Completed
1. **CRM List View Overhaul**:
   - Default sort changed from "Newest first" to "A-Z (Nombre)" in both Outreach and Inbound
   - Sort now prioritizes `lead_name` (person) over `company_name`
   - Added "Group by" selector: Sin agrupar / Por Empresa / Por Estado
   - Group headers show icon + name + count badge
   - Status grouping shows colored dots matching status colors

2. **Source Column & Normalization**:
   - Added Source column with colored badges to Outreach table (Inbound already had it)
   - Backend endpoint `POST /api/crm/normalize-sources` cleans up inconsistent source names
   - Normalized: "import" → "Importación", "website" → "Website", etc.
   - 8 sources normalized in existing data

3. **Visual Distinction Person vs Company**:
   - Company-only leads: blue Building icon + bold blue name + "Solo empresa" subtitle
   - Person leads: violet User icon + normal font
   - Company column shows "-" for company-only entries (avoids duplication)

4. **Testing**: 100% pass rate - Backend 9/9, Frontend all features (iteration_136)

### Session: April 9, 2026 (Part 1)

#### Completed
1. **CRM Intelligent Lead Conversion** - 3 modes with event selector
2. **Lead Sources Catalog** - CRUD + 12 auto-seeded defaults
3. **CSV Import Overhaul** - Default outreach, company dedup, source param
4. **Leads by Source Report** - Conversion rate breakdown
5. **Testing**: 18/18 backend, 100% frontend (iteration_135)

### Previous Sessions (Summary)
- Demand Studio: Clickable URLs, text colors, calendar states, social account CRUD
- People Ops: Org Chart, Recruitment, Employee creation, hire flow
- CRM: Sales Reports, Weekly Goals, Notifications
- Guest Flow: Virtual queue management, QR codes, kiosk mode
- Business Clarity: Department reports, expense categories, stripe payments
- Settings: Import/Export, role management

## Backlog / Future Tasks

### P1 - Next Up
- **CRM Kanban Dashboard** enhancement (already functional, could add metrics/charts)
- Add Logo Image Upload via Object Storage for Guest Flow
- Refactor `SocialMediaPage.js` (~3700 lines) into smaller components
- Extract import/export logic from `server.py` to its own router

### P2 - Integrations
- Staffdo.com API for recruitment
- Social Media APIs (Meta, TikTok)
- Email Marketing Provider (Mailchimp/Brevo)

### P3 - Features
- Kora Comms Phase 1 (WhatsApp full API)
- Complete internationalization (i18n)
- Full UTM tracking

## Test Credentials
- **Admin**: demo.agency@kora.com / Evoque2024!
- **Team**: team.test@staffdo.com / Evoque2024!

## Key Files Reference
- `backend/routers/crm.py` - CRM endpoints, lead conversion, sources, normalize
- `backend/server.py` - CSV Import/Export endpoints
- `frontend/src/components/crm/LeadOutreachSection.js` - Outreach with grouping/sorting
- `frontend/src/components/crm/LeadInboundSection.js` - Inbound with grouping/sorting
- `frontend/src/components/crm/LeadKanbanView.js` - Kanban pipeline view
- `frontend/src/components/settings/ImportExportSection.js` - Import UI

## User Language
Spanish (es)
