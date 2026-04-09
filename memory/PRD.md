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
- Dropdowns for Job Role (sourced from Recruitment), Department, and Manager
- Banking Info section (international-friendly)
- Org chart based on reporting hierarchy

### Business Clarity
- Expense Categories & Budgets with types (Variable, Operating, Investment)
- Cost Center Budgets: Automated calculation from linked Expense Categories
- Invoices, Payments, Receivables, Payables management
- Executive Dashboard with Profit Signals
- Stripe integration for payments

### Super Admin Panel
- Demo Accounts Management: Create, edit, extend trial, convert to paid
- Module Filtering for Demo Accounts
- Pricing Configuration
- Kora Core Configuration

### Demand Studio
- Social media post management (create, edit, schedule, publish)
- Content Pillars, Audiences (with granular Sub-Audiences), Segments
- Campaign management with tracking codes
- Social metrics (manual + YouTube API integration)
- Ideas bank with conversion to posts
- Calendar and Queue views
- Collaboration features (mentions, comments, shared organizations)

### CRM / Client Engagement
- Intelligent lead conversion: 3 modes (Solo Cliente, Cliente+Evento Existente, Cliente+Evento Nuevo)
- Lead Sources catalog with auto-seeded defaults
- CSV Import with configurable lead_type (outreach/inbound) and source
- Company deduplication during imports
- Sales Reports with daily activity, weekly goals, and team notifications
- Leads by source report with conversion rates
- Owner assignment and follow-up management

## Tech Stack
- **Frontend**: React with Shadcn/UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Payments**: Stripe integration
- **Auth**: JWT-based authentication (cookie + localStorage)

## What's Been Implemented

### Session: April 9, 2026

#### Completed
1. **CRM Intelligent Lead Conversion (P0)**:
   - Backend: `POST /api/leads/{lead_id}/convert` supports 3 modes via body params: `create_event` (bool) and `existing_event_id` (string)
   - Mode 1: "Solo Cliente" - creates client without event
   - Mode 2: "Cliente + Evento Existente" - links to existing event/activation
   - Mode 3: "Cliente + Evento Nuevo" - creates new event automatically
   - Frontend: Both Outreach and Inbound conversion dialogs updated with 3 selectable cards + event selector dropdown
   - Backend: `GET /api/crm/events-list` provides events and activations for linking
   - Testing: 18/18 backend tests passed, 100% frontend (iteration_135)

2. **Lead Sources Catalog (P0)**:
   - CRUD endpoints: `GET/POST/DELETE /api/crm/lead-sources`
   - Auto-seeds 12 default sources (LinkedIn, Instagram, Facebook, Google, Referido, etc.)
   - Integrated into import UI as source selector
   - Testing: Verified via backend tests

3. **CSV Import Overhaul (P0)**:
   - Default lead_type changed from "inbound" to "outreach"
   - Default source changed from "import" to "Outreach"
   - Accepts query params: `default_lead_type` and `default_source`
   - Company deduplication: checks `company_entities` collection before creating
   - Frontend: Import section shows lead type selector and source selector
   - Testing: Verified via backend tests

4. **Leads by Source Report (P0)**:
   - `GET /api/crm/reports/by-source` returns breakdown with conversion rates
   - Testing: Verified

### Previous Sessions (Summary)
- Demand Studio: Clickable URLs, text colors, calendar states, social account CRUD, rich text editor, collaboration, comments, presence
- People Ops: Org Chart, Recruitment, Employee creation, hire flow
- CRM: Sales Reports, Weekly Goals, Notifications, Lead assignment, Follow-ups
- Guest Flow: Virtual queue management, QR codes, kiosk mode
- Business Clarity: Department reports, expense categories, stripe payments
- Settings: Import/Export, role management, module protection

## Known Issues

### P0 - Critical
- All critical issues resolved

### P1 - High Priority
- None pending

## Backlog / Future Tasks

### P1 - Next Up
- Add Logo Image Upload via Object Storage for Guest Flow
- Refactor `SocialMediaPage.js` (~3700 lines) into smaller components
- Extract import/export logic from `server.py` to its own router

### P2 - Integrations
- Staffdo.com API for recruitment
- Social Media APIs (Meta, TikTok)
- Email Marketing Provider (Mailchimp/Brevo)

### P3 - Features
- Kora Comms Phase 1 (WhatsApp full API integration)
- Complete internationalization (i18n)
- Full UTM tracking
- Expand initial setup wizard

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!
- **Team**: team.test@staffdo.com / Evoque2024!

## Key Files Reference
- `backend/routers/crm.py` - CRM endpoints (lead conversion, sources, reports)
- `backend/server.py` - CSV Import/Export endpoints
- `frontend/src/components/crm/LeadOutreachSection.js` - Outreach leads with conversion dialog
- `frontend/src/components/crm/LeadInboundSection.js` - Inbound leads with conversion dialog
- `frontend/src/components/settings/ImportExportSection.js` - Import/Export UI with lead options

## User Language Preference
Spanish (es) - All user communication should be in Spanish
