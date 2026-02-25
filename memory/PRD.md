# Kora OS - Product Requirements Document

## Original Problem Statement
Multi-tenant SaaS platform where terminology, modules, and features dynamically adapt based on organization industry. Core model: Kora Core base + optional paid add-ons with 7-day free trial.

## Architecture
- **Frontend**: React + Shadcn UI + TailwindCSS
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: Custom Google OAuth + Emergent Session Exchange + JWT/Password
- **Payments**: Stripe
- **Email**: Resend (BLOCKED - pending API key)
- **Calendar**: Google Calendar API

## What's Been Implemented

### Core Features
- Multi-industry support (8 industries)
- Dynamic module system with industry-specific filtering
- Subscription plans (starter, professional, enterprise)
- Add-on marketplace with module add-ons
- CRM (leads, contacts, clients)
- Event/Program Orchestration
- Culinary Intelligence, Resource Management, Venues
- Business Clarity (financial dashboards)
- Execution Hub (goals/tasks)
- Demand Studio (marketing)
- Super Admin Panel with Data Diagnostics
- Landing Page with integration logos
- Workflow Builder UI (Automations)
- Google OAuth + Emergent OAuth login
- Demo/Influencer account creation
- **Kora Comms** - Omnichannel shared inbox (Phase 0)

### Session: Feb 24, 2026 - Email Marketing Enhancement ✅

#### Email Sequences System (Pre-development)
- **Goal**: Create email sequence (drip campaign) infrastructure for when email provider is connected
- **Status**: ✅ COMPLETE (pre-development ready for API integration)

**Backend Implementation:**
- Extended `models/demand_studio.py` with:
  - `EmailSequence`: Drip campaign definition with trigger types
  - `EmailSequenceStep`: Individual steps with delay configuration
  - `EmailSequenceEnrollment`: Contact enrollment tracking
  - `EmailTemplate`: Reusable email templates
- Added endpoints in `routers/demand_studio.py`:
  - `/api/demand-studio/email-sequences/*`: Full CRUD for sequences
  - `/api/demand-studio/email-sequences/{id}/steps/*`: Manage sequence steps
  - `/api/demand-studio/email-sequences/{id}/enroll`: Enroll contacts
  - `/api/demand-studio/email-templates/*`: Template management

**Frontend Implementation:**
- `components/demand-studio/EmailSequencesSection.js`: Full UI for:
  - Create/edit sequences with trigger types (manual, new_lead, status_change, form_submit)
  - Add/edit/delete steps with delay configuration
  - Visual step builder with timing indicators
  - Enrollment stats display
- Updated `EmailMarketingPage.js` with tabs:
  - Campaigns (existing tracker)
  - Sequences (new drip campaigns)
  - Templates (placeholder for email templates)

**Testing**: ✅ API endpoints verified - sequences and steps working

**Next Step**: Connect email provider (Resend/SendGrid) to enable actual sending

### Session: Feb 24, 2026 - Kora Comms Phase 0 ✅

#### Kora Comms - Omnichannel Shared Inbox (Phase 0: Architecture + UI)
- **Goal**: Build team-based shared inbox for WhatsApp + Email + Social DMs integrated with CRM
- **Status**: ✅ COMPLETE (Phase 0)

**Backend Implementation:**
- Created omnichannel data model (MongoDB collections):
  - `comm_inboxes`: Team-shared inbox containers
  - `comm_channels`: Channel endpoints (WhatsApp number, email, social page)
  - `comm_conversations`: Conversation threads per contact/channel
  - `comm_messages`: Individual messages with direction, provider, delivery status
  - `comm_contacts_map`: CRM contact to provider identity mapping
- API endpoints: `/api/comms/*` for full CRUD operations
- Contact timeline endpoint: `/api/comms/contact/{type}/{id}/messages`
- Stats endpoint with unassigned/my conversations counts
- Seed endpoint for test data

**Frontend Implementation:**
- `CommsInboxSection.js`: Full inbox UI with:
  - Left panel: Filters (status, assigned, inbox), conversation list
  - Right panel: Thread view, reply composer, status/assignment controls
- `CommsChannelTimeline.js`: Timeline component for Lead/Client profiles
- Integrated into Client Engagement > CRM dropdown as "Comms Inbox"
- Added channel timeline to Lead Outreach, Inbound, and Clients sections

**Files Created:**
- `backend/models/comms.py`
- `backend/routers/comms.py`
- `frontend/src/components/crm/CommsInboxSection.js`
- `frontend/src/components/crm/CommsChannelTimeline.js`

**Files Modified:**
- `backend/server.py` (registered comms_router)
- `frontend/src/pages/ClientEngagementPage.js` (added route + nav item)
- `frontend/src/components/crm/LeadOutreachSection.js`
- `frontend/src/components/crm/LeadInboundSection.js`
- `frontend/src/components/crm/ClientsSection.js`

**Testing**: ✅ API endpoints verified via curl - all operations working

### Session: Feb 24, 2026 (Cont.) - Campaign Detail Tabs Enhancement ✅

#### Campaign Detail Page Tabs (P1)
- **Problem**: Campaign detail page tabs had placeholder content
- **Solution**: Implemented full functionality for all tabs:
  - **Leads Tab**: Shows leads attributed to campaign with source and status
  - **Social Tab**: Shows social media posts linked to campaign
  - **Email Tab**: **NEW** Shows email campaigns linked to campaign
  - **Spend Tab**: Already functional - shows expense records
  - **Activations Tab**: Already functional - shows events/promotions
- **Backend Changes**: Added `campaign_id` filter to `/api/leads` endpoint
- **Files Modified**: 
  - `frontend/src/pages/demand-studio/CampaignDetailPage.js`
  - `backend/routers/crm.py`
- **Testing**: Verified via UI screenshots - all tabs load data correctly
- **Status**: ✅ COMPLETE

### Session: Feb 24, 2026 (Cont.) - Campaign Channel Type Bug Fix ✅

#### Bug Fix: Campaign Creation with Channel Type (P0)
- **Problem**: Frontend sent `channel_type` field but `resetForm()` and `openEdit()` didn't include it
- **Root Cause**: Missing `channel_type` in form reset/edit functions (lines 185-197 and 169-183)
- **Solution**: Added `channel_type` to `resetForm()` and `openEdit()` functions
- **Files Modified**: `frontend/src/pages/demand-studio/CampaignsPage.js`
- **Testing**: Verified via curl and UI screenshot - campaigns now save channel_type correctly
- **Status**: ✅ COMPLETE

### Session: Feb 24, 2026 - Cross-Organization Collaboration ✅

#### Cross-Organization Collaboration Feature (P0)
- **Objective**: Allow agencies to share Projects and Campaigns with other organizations for secure collaboration
- **Implementation**:
  
  **Backend (`backend/routers/sharing.py`)**:
  - `POST /api/share/entity` - Share a project/campaign with another org
  - `POST /api/share/{share_id}/revoke` - Revoke access
  - `GET /api/share/sent` - List outgoing shares
  - `GET /api/share/received` - List incoming shares
  - `GET /api/share/entity/{type}/{id}/access` - Check access level
  - `GET /api/share/collaboration-status` - Sidebar visibility rules
  
  **Frontend Components**:
  - `ShareEntityDialog.js` - Dialog for sharing entities with configurable permissions
  - `SharedWith.js` - Component showing who entity is shared with (with revoke capability)
  - `CollaborationDashboard.js` - **NEW** Clean dashboard to view all collaborations
  
  **Updated Pages**:
  - `ExecutionGoalDetail.js` - Added Share button and dialog for projects
  - `ExecutionHubPage.js` - Added scope filter (All/Owned/Shared)
  - `CampaignsPage.js` - Added Share button and scope filter
  - `Layout.js` - Added "Collaborations" link in sidebar navigation

- **Permission Levels**: View, Comment, Create, Edit
- **Scope Options**: Tasks, Assets, Deliverables, Posts, Comments
- **Status**: ✅ COMPLETE (Testing agent confirmed 100% pass rate)
- **Note**: Email notifications are MOCKED (Resend API key pending)

### Session: Feb 23, 2026 - CRM & Settings Enhancements ✅

#### 1. Page Refresh Fix (P0)
- **Problem**: Session lost when refreshing page in production
- **Root Cause**: Cookie missing `domain` attribute for production
- **Solution**: Dynamic cookie domain detection in `backend/routers/auth.py`
  - Preview environments: No domain (browser handles it)
  - Production (ourkora.com): `Domain=.ourkora.com`
- **Files**: `backend/routers/auth.py`

#### 2. Owner Filter & Assignment in CRM
- **Outreach Section**: Added filter by owner (All/Unassigned/Specific)
- **Inbound Section**: Added filter + Owner column + Assign button with dialog
- **Files**: `frontend/src/components/crm/LeadOutreachSection.js`, `LeadInboundSection.js`

#### 3. Logo Persistence Fix
- **Problem**: Company logo not persisting after server restart
- **Root Cause**: Logos saved as files in ephemeral storage
- **Solution**: Store logos as base64 data URLs in MongoDB
- **Files**: `backend/server.py` - `/api/settings/company/logo` endpoint

#### 4. Editable Item Categories
- **Problem**: Default categories (Food, Drinks, etc.) couldn't be edited/deleted
- **Solution**: Made all categories fully editable and deletable
- **Files**: `frontend/src/pages/SettingsPage.js`, `backend/server.py`

#### 5. Configurable Item Types (NEW)
- **Problem**: Item types hardcoded for hospitality (Food, Service, Rental, Fee)
- **Solution**: New configurable item types system per company
- **Endpoints**: 
  - `GET /api/settings/item-types`
  - `POST /api/settings/item-types`
  - `PUT /api/settings/item-types/{type_id}`
  - `DELETE /api/settings/item-types/{type_id}`
- **Files**: `backend/server.py`, `frontend/src/pages/SettingsPage.js`

## Pending/Blocked Items

### P0 - Kora Comms Next Phases
- **Phase 1: WhatsApp Provider**: Meta WhatsApp Cloud API integration
  - Support multiple WhatsApp numbers per org
  - Inbound/outbound via webhooks
  - Template messages support
  - *Requires*: Meta Business Account + WABA credentials
- **Phase 2: Email Provider**: Connect shared mailboxes (support@, sales@)
  - Inbound/outbound email threads
  - *Requires*: Resend or SendGrid API key
- **Phase 3: Social DMs**: Instagram DM, Facebook Messenger connectors

### P1 - Upcoming
- **Email Marketing Híbrido**: Tracker mejorado + envío simple de emails one-off (requiere API key Resend/SendGrid)
- **Full UTM Tracking**: Track digital campaigns using standard UTM parameters (utm_source, utm_medium, etc.)
- **Meta (Facebook/Instagram) API Integration**: Publishing, Lead Ads, analytics/spend sync
- Filter/group leads and clients by City/Country
- Add "Generate QR" button for campaign tracking codes
- Complete Dynamic Terminology Coverage
- Normalize lead statuses to single source of truth
- In-app notifications display (bell icon with unread count)

### P2 - Blocked
- Super Admin access for `admin@staffdo.com` (needs DB permission fix)
- Google OAuth in preview environments (redirect_uri_mismatch)
- Email Notifications (waiting for RESEND_API_KEY)

### Future/Backlog
- Kanban-style view for leads
- Social Media Campaign Widget
- Marketing Budget Management
- API Documentation page
- Setup wizard for new organizations

## Key Technical Details

### Cross-Organization Collaboration Schema
```json
// shared_entities collection
{
  "share_id": "share_xxx",
  "source_org_id": "company_xxx",
  "target_org_id": "company_yyy",
  "entity_type": "project|campaign",
  "entity_id": "goal_xxx|camp_xxx",
  "entity_name": "Project Name",
  "permission_level": "view|comment|create|edit",
  "scope": ["tasks", "assets", "deliverables", "posts", "comments"],
  "status": "active|revoked",
  "created_at": "ISO timestamp",
  "revoked_at": null
}
```

### Cookie Configuration
```python
def get_cookie_domain(request):
    # Preview: no domain
    if "preview" in origin or "emergent" in origin:
        return None
    # Production: .ourkora.com
    return f".{domain}"
```

### Item Types Schema
```json
{
  "type_id": "string",
  "company_id": "string",
  "name": "string",
  "name_es": "string",
  "sort_order": 0,
  "is_default": true
}
```

## Test Credentials
- **Preview**: `demo.agency@kora.com` / `Evoque2024!`
- **Production**: `admin@staffdo.com`

## Production URL
- https://ourkora.com

### Session: Feb 25, 2026 - Report a Bug Feature ✅

#### Report a Bug / Support Tickets System (P0)
- **Goal**: Allow users to report bugs from anywhere in the app, and super admins to manage these tickets
- **Status**: ✅ COMPLETE

**Backend Implementation (`backend/routers/support_tickets.py`):**
- `POST /api/support/tickets` - Create a ticket (type, subject, description, priority, page_url, browser_info)
- `GET /api/support/tickets/mine` - Get user's own tickets with optional status filter
- `GET /api/support/admin/tickets` - Admin list with pagination and filters (status, priority, type, company_id)
- `GET /api/support/admin/tickets/stats` - Ticket statistics (open, in_progress, resolved, urgent, high)
- `GET /api/support/admin/tickets/{ticket_id}` - Get single ticket (admin)
- `PATCH /api/support/admin/tickets/{ticket_id}` - Update status, priority, resolution_notes
- `DELETE /api/support/admin/tickets/{ticket_id}` - Delete ticket (admin)

**Frontend Implementation:**
- `components/BugReportButton.js` - Bug report dialog accessible from sidebar
  - Type selection: Bug, Feature, Question, Other
  - Priority levels: Low, Normal, High, Urgent
  - Auto-captures current URL and browser info
- `pages/super-admin/SupportTicketsPage.js` - Admin view for managing tickets
  - Stats cards (Open, In Progress, Urgent, Resolved)
  - Filterable table with search
  - Detail dialog with status/priority updates
  - Resolution notes and delete functionality
- Added route `/super-admin/support-tickets` in App.js
- Added navigation link "Tickets Soporte" in SuperAdminLayout.js

**Testing**: ✅ 17/17 backend tests passed (100% success rate)

**Files Modified:**
- `frontend/src/pages/super-admin/index.js` - Added SupportTicketsPage export
- `frontend/src/pages/super-admin/SuperAdminLayout.js` - Added nav link
- `frontend/src/App.js` - Added routes for support-tickets

**Files Created (previous fork):**
- `backend/routers/support_tickets.py`
- `frontend/src/components/BugReportButton.js`
- `frontend/src/pages/super-admin/SupportTicketsPage.js`

### Session: Feb 25, 2026 - Company > Contacts Architecture ✅

#### Company Management System (B2B Structure)
- **Goal**: Organize CRM with Company as parent entity containing multiple Contacts
- **Status**: ✅ COMPLETE (Phase 1)

**Backend Implementation (`backend/routers/companies.py`):**
- `GET /api/companies` - List all companies with contacts count
- `POST /api/companies` - Create new company
- `GET /api/companies/{id}` - Get company with contacts and linked leads
- `PUT /api/companies/{id}` - Update company
- `DELETE /api/companies/{id}` - Delete company (requires no contacts)
- `PATCH /api/companies/{id}/status` - Update status (Lead, Active, Client, Inactive)
- `GET /api/companies/{id}/contacts` - List contacts
- `POST /api/companies/{id}/contacts` - Add contact to company
- `PUT /api/companies/{id}/contacts/{contact_id}` - Update contact
- `DELETE /api/companies/{id}/contacts/{contact_id}` - Delete contact
- `POST /api/companies/{id}/link-lead/{lead_id}` - Link existing lead
- `POST /api/companies/migrate-from-leads` - Migration helper

**Models Updated (`backend/models/crm.py`):**
- `CompanyCreate` / `Company` - New models for B2B accounts
- `ContactCreate` / `Contact` - Updated with company_entity_id reference
- `Lead` - Updated with company_entity_id reference
- `Client` - Updated with company_entity_id reference


### Session: Feb 25, 2026 - CRM Stability & Testing Verification ✅

#### CRM Comprehensive Testing & Verification
- **Goal**: Verify all CRM features are working correctly after recent architectural changes
- **Status**: ✅ COMPLETE (100% test pass rate)

**Verified Features:**
1. **Lead Outreach Section**: 
   - Sorting controls (Newest/Oldest/A-Z/Z-A)
   - Duplicate detection with reasons (Company/Name/Email)
   - Owner name display (shows name, not email)
   - Delete lead with confirmation dialog
   
2. **Lead Inbound Section**: 
   - Status filtering
   - Owner assignment
   - Conversion to client
   
3. **Clients Section**: 
   - Expandable contacts feature working
   - Company/Individual type distinction
   
4. **Lead Contacts API**:
   - `GET /api/crm/leads/{lead_id}/contacts` - ✅
   - `POST /api/crm/leads/{lead_id}/contacts` - ✅
   - `DELETE /api/crm/leads/{lead_id}/contacts/{contact_id}` - ✅

5. **Lead Deletion**:
   - `DELETE /api/crm/leads/{lead_id}` - ✅ with audit logging

**Testing Results:**
- Backend: 20/20 tests passed (100%)
- Frontend: All UI features verified
- Test report: `/app/test_reports/iteration_67.json`

**Key Backend Endpoints Verified:**
- All 21 CRM endpoints tested and working
- Owner name enrichment via `enrich_leads_with_owner_names()` function
- Audit logging for deletions


**Frontend Implementation:**
- `components/crm/CompaniesSection.js` - Full CRUD UI for companies
  - Expandable rows showing contacts inline
  - Add/edit/delete companies
  - Add/edit/delete contacts within company
  - Stats cards (Total, Active, Leads, Contacts)
  - Status badges and filtering
- Route: `/client-engagement/crm/companies`
- Added to CRM dropdown navigation

**Database Collections:**
- `company_entities` - New collection for companies
- Companies linked to leads via `company_entity_id`

**Migration Executed:**
- 5 companies created from existing leads
- 5 leads linked to their companies
