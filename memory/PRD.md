# Kora OS - Product Requirements Document

## Original Problem Statement
Multi-tenant SaaS platform where terminology, modules, and features dynamically adapt based on organization industry. Core model: Kora Core base + optional paid add-ons with 7-day free trial.

## Architecture
- **Frontend**: React + Shadcn UI + TailwindCSS
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: Custom Google OAuth + Emergent Session Exchange + JWT/Password
- **Payments**: Stripe
- **Email**: Resend (BLOCKED - pending API key)

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
