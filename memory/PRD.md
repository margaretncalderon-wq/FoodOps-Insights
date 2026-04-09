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

### CRM / Client Engagement
- Intelligent lead conversion: 3 modes (Solo Cliente, Cliente+Evento Existente, Cliente+Evento Nuevo)
- Lead Sources catalog with auto-seeded defaults
- CSV Import with configurable lead_type and source, company deduplication
- Sales Reports with daily activity, weekly goals, team notifications
- Leads by source report
- **Combined "Lead" column**: Name + Company + Contact icons + B2B/Directo badge in single cell
- **Smart sort**: A-Z uses company name for company-only leads, person name for person leads
- **Group by**: company or status with collapsible headers
- **Source badges**: Colored by source type (LinkedIn=blue, Instagram=pink, etc.)
- **Kanban view**: Drag-and-drop pipeline with configurable stages

### Demand Studio
- Social media post management with rich text editor and text colors
- Content Pillars, Audiences, Campaigns
- Calendar with format indicators and published states
- Social account CRUD

### People Ops
- Employee management, Org Chart, Recruitment, Hire flow

### Business Clarity
- Expense Categories, Cost Center Budgets, Invoices, Payments, Stripe

## Tech Stack
- **Frontend**: React with Shadcn/UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT-based authentication

## What's Been Implemented

### Session: April 9, 2026

1. **CRM Intelligent Lead Conversion** — 3 modes: Solo Cliente, Cliente+Evento Existente, Cliente+Evento Nuevo (iteration_135)
2. **Lead Sources Catalog** — CRUD + 12 auto-seeded defaults
3. **CSV Import Overhaul** — Default outreach, company dedup, source param
4. **CRM List View Overhaul** — Combined Lead column (name+company+contact+type badge), smart A-Z sort, group by company/status, Source column with colored badges (iteration_136)
5. **Source Normalization** — Backend endpoint + 8 sources cleaned up

### Previous Sessions (Summary)
- Demand Studio: Clickable URLs, text colors, calendar states, social account CRUD
- People Ops: Org Chart, Recruitment, Employee creation, hire flow
- CRM: Sales Reports, Weekly Goals, Notifications
- Guest Flow: Virtual queue, QR codes, kiosk mode
- Business Clarity: Department reports, expense categories, stripe payments
- Settings: Import/Export, role management

## Backlog / Future Tasks

### P1 - Next Up
- Add Logo Image Upload via Object Storage for Guest Flow
- Refactor `SocialMediaPage.js` (~3700 lines)
- Extract import/export logic from `server.py` to own router

### P2 - Integrations
- Staffdo.com, Meta (Instagram), TikTok APIs
- Email Marketing (Mailchimp/Brevo)

### P3 - Features
- WhatsApp API (Kora Comms)
- i18n, UTM tracking

## Test Credentials
- **Admin**: demo.agency@kora.com / Evoque2024!
- **Team**: team.test@staffdo.com / Evoque2024!

## Key Files
- `backend/routers/crm.py` — CRM endpoints
- `backend/server.py` — CSV Import/Export
- `frontend/src/components/crm/LeadOutreachSection.js` — Outreach list
- `frontend/src/components/crm/LeadInboundSection.js` — Inbound list
- `frontend/src/components/crm/LeadKanbanView.js` — Kanban view

## User Language
Spanish (es)
