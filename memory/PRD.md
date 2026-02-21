# Kora OS - Product Requirements Document

## Original Problem Statement
Multi-tenant SaaS platform where terminology, modules, and features dynamically adapt based on organization industry. Core model: Kora Core base + optional paid add-ons with 7-day free trial.

## Architecture
- **Frontend**: React + Shadcn UI + TailwindCSS
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: Custom Google OAuth + Emergent Session Exchange + JWT/Password
- **Payments**: Stripe
- **Email**: Resend (BLOCKED - pending API key)
- **Calendar**: Google Calendar API (NEW)

## What's Been Implemented
- Multi-industry support (8 industries: Events & Hospitality, Professional Services, Healthcare, Real Estate, Education, Fitness, Consulting, Generic)
- Dynamic module system with industry-specific filtering
- Subscription plans (starter, professional, enterprise)
- Add-on marketplace with module add-ons
- CRM (leads, contacts, clients)
- Event Orchestration / Program Orchestration
- Culinary Intelligence, Resource Management, Venues
- Business Clarity (financial dashboards)
- Execution Hub (goals/tasks)
- Demand Studio (marketing)
- Super Admin Panel
- Landing Page with integration logos
- Workflow Builder UI (Automations tab in Settings)
- Google OAuth + Emergent OAuth login
- Demo/Influencer account creation
- Bulk repair endpoint for Super Admin
- **Inclusive Language by Industry** (NEW - Feb 2026)

## Recent Fixes (Feb 2026)

### P0 Fix 1: Module Loading Regression - FIXED & VERIFIED
- **Root Cause**: Existing users missing `organization_config` and/or `subscription` records
- **Fix**: `ensure_user_data_complete()` helper in `auth.py` back-fills on every login/session

### P0 Fix 2: Google Login redirect_uri_mismatch - FIXED & VERIFIED
- **Root Cause**: Backend used Origin header (stripped by K8s proxy) to build redirect_uri
- **Fix**: Frontend sends `redirect_uri` as query param from `window.location.origin`

### Feature: Inclusive Language by Industry - IMPLEMENTED (Feb 2026)
- **Requirement**: Adapt application terminology based on organization's industry (e.g., "Client" → "Patient" for Healthcare)
- **Industries Supported**: 8 industries with complete terminology mappings
  - Events & Hospitality: Event, Client, Guest, Venue, Booking, Quote
  - Professional Services: Project, Client, Stakeholder, Location, Engagement, Proposal
  - Healthcare: Appointment, Patient, Family Member, Clinic, Treatment, Medical Bill
  - Real Estate: Showing, Buyer/Seller, Viewer, Property, Listing, Commission
  - Education: Course, Student, Parent/Guardian, Campus, Enrollment, Tuition
  - Fitness: Session, Member, Guest Pass, Facility, Membership, Joining Fee
  - Consulting: Engagement, Client, Participant, Site, Contract, Statement of Work
  - Generic: Service, Client, Contact, Location, Booking, Quote
- **Frontend Components (NEW)**:
  - `TerminologySettingsSection.js` - UI in Settings > Terminology tab
  - `useTerminology.js` hook - Access industry-specific terms throughout app
  - `industryTerminology.js` - Complete terminology configuration
- **CRM Integration (NEW)**: Terminology now reflects dynamically in CRM pages
  - `ClientsSection.js` - Uses dynamic terminology for "Clients/Patients" labels
  - `LeadInboundSection.js` - Uses dynamic terminology for "Leads" labels
  - `LeadOutreachSection.js` - Uses dynamic terminology for "Leads" labels
  - `ClientEngagementPage.js` - CRM menu shows dynamic terminology
- **Backend Endpoints**:
  - `GET /api/org-config/templates` - Returns all 8 industry templates
  - `POST /api/org-config/apply-template/{template_key}` - Apply new industry
  - `GET /api/org-config/terminology` - Get terminology map for current org
- **Features**:
  - View current terminology preview
  - Select from 8 industries with icons and descriptions
  - Preview changes before applying (comparison table)
  - Apply terminology changes with confirmation
  - **Dynamic CRM labels**: All CRM labels update based on selected industry
- **Status**: TESTED & WORKING (Backend: 9/9 tests passed, Frontend verified with Healthcare terminology showing "Patients")

### Feature: Owner Assignment & Sales Report - IMPLEMENTED (Feb 2026)
- **Requirement**: Multi-vendor lead assignment with sales performance tracking
- **Backend Endpoints**:
  - `GET /api/crm/team-members` - List active team members for assignment dropdown
  - `PATCH /api/crm/leads/{lead_id}/owner` - Assign/unassign owner with audit logging
  - `GET /api/crm/reports/owners` - Sales report grouped by owner with filters
- **Frontend Components**:
  - `OwnerAssignmentSection.js` - `/client-engagement/crm/owners` - Full owner management UI
  - `SalesReportSection.js` - `/client-engagement/crm/sales-report` - Detailed sales metrics table
  - `Sales Performance Pulse` in Dashboard - Last 7 days snapshot in System Pulse

### Feature: Follow-ups Dashboard by Owner - IMPLEMENTED (Feb 2026)
- **Requirement**: Dashboard to view scheduled communications filtered by salesperson
- **Backend Changes**:
  - `GET /api/crm/follow-ups` now accepts optional `?owner_id=<user_id>` parameter
  - Special value `__unassigned__` filters for items without owner
  - Response now includes `owner_name` resolved from user_id
  - Sales role automatically sees only their own follow-ups (server-enforced)
- **Frontend Changes**:
  - `FollowUpsSection.js` updated with owner filter dropdown
  - Team members loaded for dropdown via `/api/crm/team-members`
  - Each follow-up card shows owner name or "Sin asignar" badge
- **Status**: TESTED & WORKING (9/9 backend tests passed)

### Feature: Google Calendar Integration - IMPLEMENTED (Feb 2026)
- **Requirement**: Sync CRM follow-ups with Google Calendar (shared company calendar)
- **Backend Endpoints (NEW)**:
  - `GET /api/oauth/calendar/connect` - Start OAuth flow
  - `GET /api/oauth/calendar/callback` - Handle OAuth callback
  - `GET /api/oauth/calendar/status` - Check connection status
  - `DELETE /api/oauth/calendar/disconnect` - Disconnect calendar
  - `GET /api/oauth/calendar/calendars` - List available calendars
  - `POST /api/oauth/calendar/calendars/select` - Select shared calendar
  - `POST /api/oauth/calendar/calendars/create` - Create new shared calendar
  - `POST /api/oauth/calendar/sync/follow-up` - Manual sync
- **Frontend Components (NEW)**:
  - `GoogleCalendarSettingsSection.js` - Calendar configuration in Settings > Integrations
- **Auto-sync**: When follow-ups are created/updated/completed, events auto-sync to Google Calendar
- **Production URL**: `https://ourkora.com/api/oauth/calendar/callback`
- **Status**: IMPLEMENTED, READY FOR TESTING

### Feature: Team Management & Custom Roles - IMPLEMENTED (Feb 2026)
- **Requirement**: Completar gestión de equipo con roles personalizados, edición y suspensión de usuarios
- **Backend Endpoints (NEW/MODIFIED)**:
  - `GET /api/org/members?include_suspended=true` - Ahora incluye role_name, role_name_es y status
  - `PUT /api/org/members/{id}` - Editar nombre y teléfono del usuario
  - `PUT /api/org/members/{id}/suspend` - Suspender usuario (no puede iniciar sesión)
  - `PUT /api/org/members/{id}/activate` - Reactivar usuario suspendido
  - `PUT /api/org/members/{id}/role` - Ahora acepta roles personalizados
  - `POST /api/org/members/create-direct` - Ahora acepta roles personalizados
- **Frontend Components (UPDATED)**:
  - `TeamSection.js` - Carga roles del API, incluye opciones de editar, suspender/activar
- **Roles del sistema**: admin, sales, finance, operations, viewer, marketing_partner
- **Status**: TESTED & WORKING (13/13 backend tests passed)

## Pending Issues
- P1: Email Notifications (blocked on RESEND_API_KEY)
- P1: Google Calendar Production OAuth (requires user action post-deploy)
- P2: Incomplete internationalization (hardcoded strings in UI)
- P3: Backend plan limit enforcement logic

## Upcoming Tasks
- P1: Vista Kanban estilo Monday.com para leads
- P2: Backend workflow configuration (connect Automations UI to backend)
- P3: API Documentation in Super Admin panel

## Future/Backlog
- Social Media Campaign Widget
- User Data Migration
- Marketing Budget Management
- Email Purchase Orders, Multi-currency, Negative Margin Alerts
- End-of-month summaries

## Key Credentials (Preview)
- Demo: demo.agency@kora.com / Evoque2024!

## Google Calendar Config
- Client ID: 628586294944-i8evug9fjdn7ir81s33a01mkn50k5ek4.apps.googleusercontent.com
- Redirect URI: https://ourkora.com/api/oauth/calendar/callback
