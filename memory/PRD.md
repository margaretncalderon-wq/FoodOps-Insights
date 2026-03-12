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
1. **"Deal Code" input on registration page**: NOT STARTED
   - Location: `frontend/src/pages/onboarding/RegisterPage.js`

### P1 - High Priority
1. **Unstable User Sessions**: RESOLVED - JWT-first auth, auto-refresh, 401 interceptor

### P2 - Data Migration
1. **Employee department_id backfill**: Script needed
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
