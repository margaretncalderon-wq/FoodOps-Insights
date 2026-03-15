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

## Tech Stack
- **Frontend**: React with Shadcn/UI components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Payments**: Stripe integration
- **Auth**: JWT-based authentication (cookie + localStorage)

## What's Been Implemented

### Session: March 15, 2026

#### Completed
1. **Deal Code on Registration Page (P0 Feature)**:
   - Added `deal_code: Optional[str]` field to `UserCreate` model
   - Backend `/api/auth/register` stores `deal_code` in both `users` and `companies` collections
   - Backend `/api/auth/google/complete-registration` also accepts and stores `deal_code`
   - Frontend: New input field in Step 3 of registration with placeholder "Deal Code (opcional)"
   - Field is optional — registration works with or without it
   - All tests passed (6/6 backend, 100% frontend)

2. **Business Clarity - Department Report (P2 Feature)**:
   - New backend endpoint: `GET /api/business-clarity/reports/by-department?year=&month=`
   - Groups financial data by department: employees, payroll, supplier costs, direct expenses
   - Aggregates budget from linked cost centers
   - Frontend: New "Por Departamento" tab in Executive Reports section
   - Includes summary cards, detailed table with utilization bars, and totals row
   - All tests passed (15/15 backend, 100% frontend)

3. **Employee Department Backfill Migration (P2 Feature)**:
   - New backend endpoint: `POST /api/people-ops/departments/backfill`
   - Matches employees' `department` string to `department_id` (case-insensitive)
   - Also backfills cost center `department_id` links
   - Returns detailed results: updated count, unmatched employees, available departments
   - Tests passed: 1 employee migrated successfully

4. **Bug Fix - Demand Studio: Idea to Post Conversion (P0)**:
   - Fixed: Converting idea to post now sets proper status (production/editing/etc.) instead of 'idea'
   - Backend accepts `target_status` query param on convert endpoint
   - Frontend: New conversion dialog with account AND status selector
   - Fixed: `source_url` from idea now preserved as `link_url` in converted post
   - Fixed: Post edit form label now says "URL Fuente (inspiración)" instead of "Link URL"
   - Fixed: Posts with link_url show clickable "URL Fuente" link in queue table
   - Tests passed: 10/10 backend + frontend code review verified

5. **Bug Fix - Demand Studio: Social Contributor Full Access (P0)**:
   - Fixed: Calendar endpoint now accepts `org_id` param to show posts from shared orgs
   - Fixed: `social_viewer` role upgraded to level 2 (same as contributor) for full write access
   - Fixed: Frontend `fetchCalendarPosts` now passes `org_id` when viewing shared org
   - Tests passed: 14/14 backend + frontend code review verified

6. **Activity Log Visible para Social Contributors (Feature)**:
   - Backend: Endpoints `/api/activity-logs/` y `/api/activity-feed/recent` ahora aceptan `org_id` para mostrar logs de orgs compartidas
   - Backend: Verificación de membresía antes de mostrar logs de otra org
   - Frontend: `GlobalActivityLog` y `ActivityFeed` aceptan `orgId` prop
   - Frontend: Botón de historial (History) agregado en Demand Studio Social con `data-testid='demand-studio-activity-log-btn'`
   - Tests passed: 15/15 backend + frontend verificado

### Session: March 14, 2026

#### Completed
1. **Rich Text Content Editor for Posts & Ideas (Feature)**:
   - Added `content_body` (Optional[str]) field to `SocialPostCreate`, `SocialPost`, `ContentIdeaCreate`, `ContentIdea` models
   - Enhanced `RichTextEditor` component with Strikethrough and Checklist (checkbox) buttons
   - Integrated RichTextEditor as "Contenido / Script" section in Post and Idea dialogs
   - Backend: All CRUD endpoints (create, update, duplicate, convert-idea-to-post) now handle `content_body`
   - All tests passed (12/12 backend, 100% frontend)

2. **Full CRUD Access for Shared Company Profiles (Critical Bug Fix)**:
   - Fixed `update_social_post` - now accepts `org_id` query param and searches membership companies
   - Fixed `delete_social_post` - now accepts `org_id` and falls back to membership companies
   - Fixed `patch_social_post` (quick status change) - now accepts `org_id` with membership fallback
   - Fixed `mark_post_as_posted` - now accepts `org_id`
   - Fixed `duplicate_social_post` - now accepts `org_id` with membership fallback
   - Fixed `delete_content_idea` - now accepts `org_id` with membership fallback
   - Fixed `update_content_idea` - now searches membership companies on not found
   - Fixed `convert_idea_to_post` - now accepts `org_id` with membership fallback
   - Frontend: All CRUD calls (delete post/idea, mark-posted, quick status change, drag-drop calendar, duplicate, delete pillar/audience/segment) now send `org_id` via `getOrgParam()`
   - All tests passed (12/12 backend, 100% frontend)

### Session: March 12, 2026

#### Completed
1. **Sub-Audiences in Metrics/Insights (P0)**:
   - Added `sub_audience_id` field to `SocialPostCreate` and `SocialPost` models
   - Updated POST, PUT, and DUPLICATE endpoints for social posts to handle `sub_audience_id`
   - Updated `/api/demand-studio/social/insights` endpoint to return `byAudience` and `bySubAudience` aggregations
   - Added sub-audience selector in post creation/edit dialog (dependent on selected audience)
   - Added "Por Audiencia" and "Por Sub-Audiencia" insight cards in Overview tab
   - Added "Sub-Aud." column in Queue table
   - All tests passed (13/13 backend, 100% frontend)

2. **Quick Status Change Buttons**:
   - Queue: DropdownMenu with all status transitions + Duplicate + Delete
   - Ideas: "Producción" button to send ideas directly to production
   - Production tab: "A Edición" button on each post
   - Editing tab: "A Borrador" button on each post
   - Mini-dialog prompts for production date when moving to Production/Editing
   - Backend PATCH endpoint extended to accept production_date and scheduled_at
   - All tests passed (10/10 backend, 100% frontend)

3. **Calendar Drag & Drop**:
   - Posts can be dragged between calendar days to reschedule
   - Uses @hello-pangea/dnd library (already installed)
   - Dropping a post updates its scheduled_at via PATCH endpoint
   - Visual feedback: highlight on drag-over, shadow on dragging
   - All tests passed

4. **Fix: Unstable User Sessions (P1 recurring 6+ times)**:
   - Reordered `get_current_user`: JWT decode first (no DB query), then session fallback
   - New `/auth/refresh` endpoint to extend JWT tokens
   - `/auth/me` auto-refreshes JWT on every call (rolling 7-day window)
   - Frontend: global axios 401 response interceptor → redirect to /login?expired=1
   - Frontend: periodic token refresh every 4 hours in AuthContext
   - Frontend: Login page shows "sesión expirada" toast on redirect
   - All saving dialogs have `saving` guards to prevent double-click
   - All tests passed (17/17 backend, 95%+ frontend)

5. **Fix: Team Visibility in Demand Studio (Critical)**:
   - All GET endpoints (posts, accounts, stats, insights, calendar, ideas) now aggregate data from ALL companies the user is a member of via `visible_company_ids` with `$in` query
   - Social accounts endpoint now includes ALL active memberships, not just social-specific roles
   - Team notifications created when posts are created or status changes
   - All tests passed (14/14 backend, 100% frontend)

### Previous Sessions

#### Completed Previously
- CC Budgets Detail Panel
- Demo Accounts Edit Feature
- Module Filtering for Demo Accounts
- Pricing Configuration in Super Admin
- Kora Core Configuration
- Bug Fix (Org Structure): Resolved critical bug with blank screen
- Bug Fix (User Visibility): Fixed inactive users appearing in CRM and Demand Studio
- Bug Fix (Collaboration): Fixed shared organization context issues
- Bug Fix (CRM Name Display): Fixed email-derived name display
- Bug Fix (Demand Studio "Ideas"): Fixed Ideas/Queue tab content
- Feature (Partners): Notes tab with CommentsSection
- Feature (Demand Studio): Sub-Audiences, Segment-Pillar linking, clickable notifications, reordered buttons

## Known Issues

### P0 - Critical
1. **"Deal Code" input on registration page**: COMPLETED (March 15, 2026)
   - Location: `frontend/src/pages/RegisterPage.js`, `backend/models/auth.py`, `backend/routers/auth.py`

### P1 - High Priority
1. **Unstable User Sessions**: RESOLVED - JWT-first auth, auto-refresh, 401 interceptor

### P2 - Data Migration
1. **Employee department_id backfill**: COMPLETED (March 15, 2026)
   - Endpoint: `POST /api/people-ops/departments/backfill`
   - Status: NOT STARTED

### P2 - Improvements
- Enhance Business Clarity reports with Department grouping/filtering

## Backlog / Future Tasks

### P3 - Integrations
- Staffdo.com API for recruitment
- Social Media APIs (Meta, TikTok)
- Email Marketing Provider (Mailchimp/Brevo)
- Full UTM tracking

### P4 - Features
- Kora Comms Phase 1 (WhatsApp integration)
- Complete internationalization (i18n)
- Expand initial setup wizard

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Key Files Reference
- `backend/models/demand_studio.py` - Pydantic models (SocialPostCreate, Audience, SubAudience)
- `backend/routers/demand_studio.py` - All Demand Studio endpoints
- `backend/routers/auth.py` - Authentication (investigate for session issues)
- `frontend/src/pages/demand-studio/SocialMediaPage.js` - Main social media page
- `frontend/src/components/demand-studio/SocialMetricsSection.js` - Social metrics component

## User Language Preference
Spanish (es) - All user communication should be in Spanish
