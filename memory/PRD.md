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
- Multi-industry support (events, agency, consulting, generic)
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

## Recent Fixes (Feb 2026)

### P0 Fix 1: Module Loading Regression - FIXED & VERIFIED
- **Root Cause**: Existing users missing `organization_config` and/or `subscription` records
- **Fix**: `ensure_user_data_complete()` helper in `auth.py` back-fills on every login/session

### P0 Fix 2: Google Login redirect_uri_mismatch - FIXED & VERIFIED
- **Root Cause**: Backend used Origin header (stripped by K8s proxy) to build redirect_uri
- **Fix**: Frontend sends `redirect_uri` as query param from `window.location.origin`

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
- P2: Incomplete internationalization (hardcoded strings in UI)
- P3: Backend plan limit enforcement logic
- P3: Email Notifications (blocked on RESEND_API_KEY)

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
