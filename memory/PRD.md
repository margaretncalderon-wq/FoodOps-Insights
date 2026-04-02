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

7. **Bug Fix - Settings Dialog No Cierra / Datos No Refrescan (P0)**:
   - Root cause: 5 endpoints backend (update/delete accounts, pillars, audiences, segments) no aceptaban `org_id`, usando `user.company_id` en vez de la org compartida
   - Backend: Agregado `org_id` param a `update_social_account`, `delete_social_account`, `delete_content_pillar`, `delete_audience`, `delete_segment`
   - Frontend: Todos los handlers de save/delete ahora usan `await fetchData()` para refrescar datos inmediatamente
   - Tests passed: 19/19 backend + frontend verificado

8. **Feature - Pilares de Contenido Enriquecidos (UX)**:
   - Backend: Modelo `ContentPillar` enriquecido con `what_is_it`, `why_it_matters`, `content_tags`, `weight_percentage`, `color`, `icon`
   - Frontend: Cards visuales con fondo de color, badge de porcentaje, barra de progreso, paneles oscuros para "Qué es"/"Por qué importa", tags como badges
   - Frontend: Diálogo enriquecido con todos los campos nuevos + input de tags con Enter/botón
   - Bug fix: `Promise.all` en `fetchData` ahora tiene `.catch()` individual para resiliencia
   - Tests passed: 8/8 backend + frontend verificado

9. **Bug Fix - Settings CRUD No Refresca Datos (P0)**:
   - Root cause: `fetchData()` se llamaba sin args — recargaba datos de la org equivocada
   - Fix: Todos los handlers de save/delete ahora llaman `fetchData(isOwnOrg ? null : selectedOrgId)`
   - Tests passed: Verificado en 8 handlers

10. **Feature - Mini-Reporte por Pilar en Calendario (UX)**:
    - Nuevo endpoint: `GET /api/demand-studio/social/calendar/pillar-stats?year=&month=`
    - Frontend: chips horizontales con icono, nombre, total posts y desglose por status (pub/prod/edit/cola)
    - Tests passed: Endpoint + UI verificados

11. **Bug Fix - Posts No Aparecen en Calendario (P0)**:
    - Root cause: Calendar query solo buscaba `scheduled_at`/`posted_at`, ignorando posts sin fecha de programación
    - Fix backend: Query ahora incluye `created_at` como fallback cuando `scheduled_at` es null
    - Fix frontend: `getPostsForDay` ahora muestra posts en su `created_at` cuando no tienen `scheduled_at`
    - Tests passed: 8/8 backend + frontend verificado

12. **Feature - Ideas Organizadas con Campos de Post (UX)**:
    - Backend: Modelo `ContentIdea` enriquecido con `segment_id`, `audience_id`, `social_account_id`
    - Frontend: Selector "Agrupar por" con 5 opciones (Sin agrupar, Pilar, Segmento, Audiencia, Estado)
    - Frontend: Cards muestran badges de pilar (violeta), segmento (sky), audiencia (emerald), cuenta (gray)
    - Frontend: Ideas usadas se agrupan al final automáticamente
    - Frontend: Diálogo de idea con 4 selectores (pilar, segmento, audiencia, cuenta) en grid 2x2
    - Tests passed: 7/7 backend + frontend verificado

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

### Session: March 15, 2026 (Fork 2)

#### Completed
1. **Bug Fix - Demand Studio: Save Dialog Not Closing (P0 Recurring)**:
   - Root cause: Missing `import { toast } from 'sonner'` in SocialMediaPage.js
   - `toast.success()` and `toast.error()` calls threw `ReferenceError` silently, preventing code from reaching `setDialogOpen(false)`
   - Fix: Added import + all handlers now consistently use `await fetchData(isOwnOrg ? null : selectedOrgId)`
   - Better error messages showing `error.response.data.detail` for API errors
   - Testing: 14/14 backend tests passed, frontend verified

2. **Feature - Calendar Pillar Stats with Percentages & Alerts (P1)**:
   - Backend: `GET /api/demand-studio/social/calendar/pillar-stats` now returns `actual_percentage`, `target_percentage`, `over_target`, `diff_from_target`
   - Frontend: Mini-report shows actual % vs target %, highlighted in pillar color
   - Alert: Red border + badge when a pillar exceeds target by >10 percentage points
   - Warning banner appears below stats when any pillar is over-allocated
   - Testing: Verified via API and frontend screenshot

3. **Bug Fix - Own Demand Studio Not Visible (P0)**:
   - Root cause: `GET /api/user/organizations` only checked `user.company_id`, ignoring `user.active_org_id`
   - For users where `company_id` is null but `active_org_id` is set, their own org didn't appear
   - Added auto-create company for users who have no company at all
   - Fix: Uses `company_id or active_org_id`, checks memberships, auto-creates if needed

7. **Bug Fix - Data Isolation in Demand Studio (P0 Critical)**:
   - Root cause: When viewing own org (no org_id), endpoints aggregated ALL company_ids from memberships
   - This caused posts from Ciano Gourmet and StaffDO to appear when viewing Margaret's own account
   - Fix: Removed `visible_company_ids` aggregation from 5 endpoints (posts, calendar, stats, insights, ideas)
   - All endpoints now use simple `{"company_id": company_id}` queries
   - Secondary fix: `company_filter` undefined variable in get_social_stats (found by testing agent)
   - Testing: 13/13 backend tests passed, all endpoints verified
   - Backend: 4 endpoints in `/api/presence/` (heartbeat, online, entity/{type}/{id}, leave)
   - Presence stored in MongoDB `presence` collection with 60-second online threshold
   - Sidebar: PresenceAvatarStack shows online team members with green dot + tooltip (name + current activity)
   - Post table: Mini Figma-style avatars next to posts being edited by others
   - Post dialog: Blue EntityPresenceBar shows "X está viendo esto" when others are editing same post
   - Polling every 30s for presence heartbeat + notification updates
   - usePresence hook handles all polling logic
   - Testing: 16/17 backend, 100% frontend verified
   - Notifications now include entity_id in link (e.g., `/demand-studio/social-media?openPost=xxx`)
   - NotificationBell uses React Router navigate() for internal links
   - SocialMediaPage handles `?openPost=xxx` URL param and auto-opens the post dialog
   - Inline comment badges next to posts (blue @badge for unread, gray for read-only comments)
   - Badges visible in: Queue table, Calendar kanban, Production queue, Editing queue
   - New endpoint: GET /api/comments/counts/by-entities (aggregates comment + unread notification counts)
   - Testing: 10/10 backend, 100% frontend verified

### Session: March 22, 2026

#### Completed
1. **Feature - Guest Flow: Virtual Queue Management System (P0)**:
   - Full-stack feature for managing guest queues at live event activations (photo booths, headshots, etc.)
   - Backend: Complete router `/api/guest-flow/` with 15 endpoints (activations CRUD, queue management, public guest endpoints, WhatsApp click-to-chat, stats, activity log, linked marketing activation)
   - Frontend: 4 new pages - GuestJoinPage (public form), GuestStatusPage (auto-refresh status), StaffDashboardPage (tablet-friendly queue management), NowServingPage (display screen)
   - GuestFlowSection component integrated into OperationalFlowTab for event-level activation management
   - **QR Code visual**: react-qr-code generates scannable QR codes in dialogs (GuestFlowSection + StaffDashboard)
   - **Event Logo**: logo_url field on activations, displayed on all public pages (GuestJoinPage, GuestStatusPage, NowServingPage)
   - **Demand Studio link**: New endpoint `/api/guest-flow/event/{id}/linked-marketing-activation` connects Guest Flow with existing marketing activations
2. **Bug Fix - Client Engagement Visibility (March 23, 2026)**:
   - Added `ModuleProtectedRoute` in App.js that checks module enablement before rendering protected routes
   - Added missing permission groups in RolesSettingsSection: client_engagement, execution_hub, partners, business_clarity
   - Updated default system roles (finance, hr, operations, marketing) to include relevant new permissions
   - Routes like /client-engagement, /demand-studio, /event-orchestration now verify module access

3. **Bug Fix - Chrome Login / Session Persistence (March 23, 2026)**:
   - Fixed `/auth/me` endpoint to return `access_token` in response (was missing, causing localStorage to never refresh)
   - Frontend now updates token from /me response, preventing stale session issues
   - Multiple concurrent sessions from different browsers confirmed working
   - Testing: 8/8 backend + 100% frontend verified (iteration_129)

4. **Feature - People Ops: Departamentos y Posiciones (March 23, 2026)**:
   - Reescrito OrgChartSection con 3 sub-tabs: Departamentos, Posiciones, Organigrama
   - CRUD completo para departamentos (crear, editar, eliminar, jerarquía padre)
   - CRUD completo para posiciones (crear, editar, eliminar, nivel, departamento, reporta a)
   - Nuevos endpoints backend: GET/POST/PUT/DELETE /api/people-ops/positions
   - Posiciones agrupadas por departamento con conteo de empleados
   - Organigrama visual expandible con posiciones y empleados por departamento
   - Testing: APIs verificadas + UI verificada via screenshot

5. **Bug Fix - Comments showing on all posts (April 2, 2026)**:
   - Fixed CommentsSection rendering stale comments when switching between posts
   - Added `key={editingPost.post_id}` to force clean remount on post change
   - Added `useEffect` to clear comments state when entityId changes
   - Also fixed for ideas: `key={editingIdea.idea_id}`
   - Backend confirmed: comments properly isolated by entity_id (API returns correct data per post)

   - **Modo Kiosko**: Pagina full-screen `/guest/kiosk/:id` con QR grande, logo, "Ahora Sirviendo", contador en cola, y lista de siguientes. Auto-refresh cada 6s. Accesible desde StaffDashboard y GuestFlowSection.
   - DR WhatsApp number normalization (809/829/849 area codes)
   - Duplicate entry prevention via normalized WhatsApp number
   - Queue actions: activate, pause, resume, close, reset, call-next, move up/down, cancel, re-add
   - DB collections: gf_activations, gf_queue_entries, gf_activity_log
   - Routes: /guest/join/:id (public), /guest/status/:id (public), /guest/now-serving/:id (public), /guest/staff/:id (protected)
   - Testing: 34 backend tests + 100% frontend verified (iterations 127-128)

## Known Issues

### P0 - Critical
- All critical issues resolved

### P1 - High Priority
- None pending

## Backlog / Future Tasks

### P3 - Integrations
- Staffdo.com API for recruitment
- Social Media APIs (Meta, TikTok)
- Email Marketing Provider (Mailchimp/Brevo)
- Full UTM tracking

### P4 - Features
- Kora Comms Phase 1 (WhatsApp full API integration)
- Complete internationalization (i18n)
- Expand initial setup wizard
- Refactor SocialMediaPage.js (~3500 lines) into smaller components

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Key Files Reference
- `backend/routers/guest_flow.py` - Guest Flow endpoints (14 endpoints)
- `frontend/src/pages/guest-flow/GuestJoinPage.js` - Public guest join form
- `frontend/src/pages/guest-flow/GuestStatusPage.js` - Public guest status display
- `frontend/src/pages/guest-flow/NowServingPage.js` - Public now serving display
- `frontend/src/pages/guest-flow/StaffDashboardPage.js` - Staff queue management dashboard
- `frontend/src/components/orchestration/GuestFlowSection.js` - Integration into OperationalFlowTab
- `backend/models/demand_studio.py` - Pydantic models (SocialPostCreate, Audience, SubAudience)
- `backend/routers/demand_studio.py` - All Demand Studio endpoints
- `backend/routers/auth.py` - Authentication
- `frontend/src/pages/demand-studio/SocialMediaPage.js` - Main social media page

## User Language Preference
Spanish (es) - All user communication should be in Spanish
