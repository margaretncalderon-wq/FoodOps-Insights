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
  - `industryTerminology.js` - Complete terminology configuration with INDUSTRY_ALIASES support
- **CRM Integration**: Terminology now reflects dynamically in CRM pages
  - `ClientsSection.js` - Uses dynamic terminology for "Clients/Patients" labels
  - `LeadInboundSection.js` - Uses dynamic terminology for "Leads" labels
  - `LeadOutreachSection.js` - Uses dynamic terminology for "Leads" labels
  - `ClientEngagementPage.js` - CRM menu shows dynamic terminology
- **Dashboard Integration**: Sales Performance Pulse shows "New Patients" for Healthcare
- **Proposals Integration**: Client-facing labels adapt to industry terminology
- **Settings Integration**: Categories description adapts (e.g., "appointments orders" for Healthcare)
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
  - **Default Terminology on Registration**: New users automatically get industry-specific terminology based on their selection during signup (Events & Hospitality, Professional Services, or General Services)
- **Bug Fixes (Feb 21, 2026)**:
  - Fixed "Professional Services" selection error - Key mismatch between `professional_services` (backend) and `agency` (frontend) resolved with INDUSTRY_ALIASES
  - Updated `industryTerminology.js` to use `professional_services` as primary key
  - Added alias support in `getIndustryTerminology()` and `getIndustryInfo()` functions
- **Status**: TESTED & WORKING (All 8 industries verified, registration flow tested)

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

### Fix: Login Page Layout - FIXED (Feb 22, 2026)
- **Issue**: Right panel content (modules illustration) was cut off when accessing protected routes without auth
- **Root Cause**: CSS `overflow-hidden` with absolute positioned decorative circles extending beyond container boundaries
- **Fix**: Adjusted decorative circle positioning in `LoginPage.js` (moved from `bottom-32` to `bottom-24` and reduced size)
- **Files Modified**: `/app/frontend/src/pages/LoginPage.js`
- **Status**: TESTED & WORKING (verified on /login, /settings, /crm redirects)

### Feature: Company Information & Logo Upload - IMPLEMENTED (Feb 22, 2026)
- **Requirement**: Allow logo upload and complete business information in Settings > Branding
- **Backend Changes**:
  - Extended `Company` model with new fields: `legal_name`, `trade_name`, `tax_id`, `email`, `phone`, `website`, `address`, `city`, `state`, `country`, `postal_code`, `tax_regime`, `industry_sector`, `employee_count`, `decimal_precision`, `decimal_separator`
  - Added `POST /api/settings/company/logo` endpoint for logo file upload
  - Updated `PUT /api/settings/company` to accept new fields
- **Frontend Changes**:
  - Redesigned Branding tab with 3 cards: General Info, Location, Additional Info
  - Added logo upload with drag & drop style interface and preview
  - Added all business information fields matching the screenshot reference
- **Status**: TESTED & WORKING

### Feature: Company Info in Documents - IMPLEMENTED (Feb 22, 2026)
- **Requirement**: Show company info (logo, legal name, RNC, address, phone, email) in proposals, invoices, and other generated documents instead of "Kora"
- **Files Modified**:
  - `/app/frontend/src/pages/DocumentPreview.js` - Updated header to show full company info
  - `/app/frontend/src/components/PurchaseOrdersSection.js` - Updated PO print/preview
  - `/app/frontend/src/components/RecipeBuilder.js` - Updated recipe card print
- **Status**: TESTED & WORKING

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
