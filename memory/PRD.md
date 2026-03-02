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

#### P0/P1 Fixes Session ✅

**P0 - UI para Contactos en Leads**:
- Status: ✅ COMPLETE
- Added "Contacts" tab to Lead detail dialogs (both Outreach and Inbound)
- Tab layout now: Info | Contacts | Comms
- Contacts tab shows list of contacts or "No contacts yet" message
- Add Contact dialog with fields: Name*, Email, Phone, WhatsApp, Role, Primary checkbox
- Functions: fetchLeadContacts, handleAddContact, handleDeleteContact

**P1 - File Upload for Bug Report**:
- Status: ✅ COMPLETE
- New endpoint: `POST /api/upload` with authentication
- Supports images (jpeg, png, gif, webp) and videos (mp4, webm, quicktime)
- Files saved to `/app/backend/uploads/` with unique UUID names
- Returns: `{ url, file_url, filename }`
- BugReportButton.js already had UI, now has working backend

**Testing Results:**
- Backend: 100% success rate
- Frontend: 100% (5/5 features verified)
- Test report: `/app/test_reports/iteration_68.json`

**Files Modified:**
- `backend/server.py` - Added `/api/upload` endpoint
- `frontend/src/components/crm/LeadOutreachSection.js` - Added Contacts tab + Add Contact dialog
- `frontend/src/components/crm/LeadInboundSection.js` - Added Contacts tab + Add Contact dialog


### Session: Feb 25, 2026 - Tezza-like Studio & Feed View ✅

#### Implemented Features (Additive Only - No Breaking Changes)

**1. Feed Tab in Social Media**
- New tab added: Overview | Ideas | Calendar | Queue | **Feed** | Settings
- View modes: Planned / Published / Mixed
- Preview modes: Original / Styled
- Instagram-like 3-column grid with lazy loading
- Detail drawer for post info and actions

**2. Studio Editor (Tezza-like)**
- Accessible via "Studio" button in Social Media
- Layout: Media tray (left) | Preview (center) | Controls (right)
- Controls tabs:
  - **Looks**: Preset carousel with 8 default looks (Natural, Warm Glow, Cool Crisp, etc.)
  - **Adjust**: 10 sliders (Exposure, Contrast, Highlights, Shadows, Temperature, Saturation, Grain, Sharpen, Vignette, Glow)
  - **Crop**: 1:1, 4:5, 9:16, 16:9 aspect ratios
  - **Export**: Export Pack with multiple sizes
- Features: Apply to all (batch), Save, Export

**3. New Backend Models (Non-Breaking)**
- `brand_looks` - Preset configurations
- `media_assets` - Uploaded media with edit history
- `instagram_connections` - OAuth connection storage
- `instagram_media_cache` - Cached IG posts

**4. New API Endpoints** (`/api/studio/*`)
- `GET /api/studio/feature-flags` - Feature toggles
- `GET/POST/PUT/DELETE /api/studio/looks` - Preset management
- `GET/POST/PUT/DELETE /api/studio/assets` - Media assets
- `POST /api/studio/assets/upload` - File upload
- `GET /api/studio/instagram/connection` - IG status
- `POST /api/studio/instagram/connect` - Store IG OAuth
- `GET /api/studio/feed/planned` - Planned posts
- `GET /api/studio/feed/mixed` - Combined feed

**Files Created:**
- `backend/models/studio.py` - Data models
- `backend/routers/studio.py` - API routes
- `frontend/src/components/demand-studio/FeedTab.js`
- `frontend/src/components/demand-studio/StudioEditor.js`

**Files Modified:**
- `backend/server.py` - Registered studio_router
- `frontend/src/pages/demand-studio/SocialMediaPage.js` - Added Feed tab + Studio button

**Testing Results:**
- Backend: 100% (14/14 endpoints verified)
- Frontend: Code verified
- Test report: `/app/test_reports/iteration_71.json`

**MOCKED:** Instagram sync returns mock success (not actual IG API calls for MVP)



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


### Session: Mar 02, 2026 - Brand Hub & Campaign DNA Integration ✅

#### Brand Hub & Campaign DNA Features (P0)
- **Goal**: Implement centralized brand management system with campaign-specific overrides
- **Status**: ✅ COMPLETE

**Backend Implementation:**
- Full token resolver in `backend/routers/brand_hub.py`:
  - `resolve_brand_config()` - Merges brand + campaign level settings
  - `GET /api/brand-hub/resolve` - Returns effective merged config
  - Brand Kits CRUD endpoints
  - Look Packs management
  - Messaging Packs management
  - Templates management
  - Playbook Pages management
  - Campaign DNA CRUD endpoints

**Frontend Implementation:**
- `components/demand-studio/BrandHub.js` - Full Brand Hub UI:
  - 5 tabs: Brand Kit | Looks | Templates | Messaging | Playbooks
  - Colors section with 7 color pickers + quick presets
  - Typography configuration
  - Logo upload placeholders
  - Save functionality

- `components/demand-studio/CampaignDNA.js` - Campaign-specific overrides:
  - 4 tabs: Theme | Looks | Copy | Export
  - Color override with brand inheritance indicator
  - Look Pack selection
  - Messaging Pack selection
  - Export rules configuration
  - "Reset to Brand Hub" button

- `pages/demand-studio/CampaignDetailPage.js` - Added "DNA" tab:
  - TabsTrigger with Sparkles icon
  - TabsContent rendering CampaignDNA component

- `pages/demand-studio/DemandStudioSettings.js` - Added "Brand Hub" tab:
  - Already integrated in previous fork
  - Accessible via Settings in Demand Studio

**Bug Fixed:**
- `UnboundLocalError` in resolve endpoint - Added `campaign_dna = None` initialization

**Template Library Added (Mar 02):**
- 6 pre-designed templates added to Brand Hub:
  1. Post Promocional (social_post / promotion)
  2. Story con CTA (story / engagement)
  3. Carrusel Producto (carousel / product)
  4. Email Newsletter (email / newsletter)
  5. Email Promocional (email / promotion)
  6. Quote Card (social_post / engagement)
- New endpoints: `/api/brand-hub/templates/library` and `/api/brand-hub/templates/seed-defaults`
- UI shows template grid with category badges and "Default" indicator

**Testing Results:**
- Backend: 27/27 tests pass (100%)
- Frontend: All features verified working
- Test report: `/app/test_reports/iteration_72.json`, `/app/test_reports/iteration_73.json`

### Session: Mar 02, 2026 - Template Previews & Studio Integration ✅

#### Template Visual Previews (User Request)
- **Goal**: Add visual preview images to all templates
- **Status**: ✅ COMPLETE

**Implementation:**
- Generated 6 AI preview images using Gemini:
  1. Post Promocional - Purple gradient with CTA
  2. Story con CTA - "ADVENTURE AWAITS" vertical
  3. Carrusel Producto - Product showcase layout
  4. Email Newsletter - Single column email design
  5. Email Promocional - "30% OFF" promo banner
  6. Quote Card - Inspirational quote design
- Updated DEFAULT_TEMPLATES with preview_url for all 6 templates
- Modified seed endpoint to update existing templates with previews

#### Studio Editor Integration (User Request)
- **Goal**: Allow editing templates in Studio
- **Status**: ✅ COMPLETE

**Implementation:**
- Added `openTemplateInStudio()` function in BrandHub.js
- Hover overlay shows "Editar en Studio" / "Edit in Studio" button
- StudioEditor dialog opens with template image in canvas
- Asset conversion: template → studio asset format with original_url
- Full editing capabilities:
  - 8 Look presets (Natural, Warm Glow, Cool Crisp, etc.)
  - 10 Adjustment sliders (Exposure, Contrast, etc.)
  - Crop ratios (1:1, 4:5, 9:16, 16:9)
  - Export functionality

**Files Modified:**
- `backend/routers/brand_hub.py` - Added preview_url to DEFAULT_TEMPLATES, updated seed endpoint
- `frontend/src/components/demand-studio/BrandHub.js` - Added Studio integration, hover overlays

**Testing Results:**
- Backend: 10/10 tests pass (100%)
- Frontend: All features verified working
- Test report: `/app/test_reports/iteration_74.json`

### Session: Mar 02, 2026 - Template Creation Features ✅

#### Create Template, Upload & Save as New (User Request)
- **Goal**: Allow users to create templates, upload images, and save variations
- **Status**: ✅ COMPLETE

**Features Implemented:**

1. **Create Template Dialog (BrandHub)**
   - Button "Create Template" opens modal
   - Fields: Template Name, Type (dropdown), Category (dropdown)
   - Upload area for preview image
   - Uses /api/upload endpoint for image upload
   - Creates template via POST /api/brand-hub/templates

2. **Upload Template Image**
   - Drag & drop or click to upload
   - Uses existing /api/upload endpoint
   - Supports image/* files
   - Preview displayed after upload with delete option

3. **Save as Template (Studio Editor)**
   - New button "Save as Template" in header
   - Opens dialog with name, type, category fields
   - Shows preview of current image with applied filters
   - Saves look settings and sliders with template
   - Refreshes template list after save

**Backend Changes:**
- Added `category` field to TemplateCreate model
- Added `is_default` field to distinguish custom from default templates
- Updated POST /templates endpoint

**Frontend Changes:**
- BrandHub.js: Added createTemplateOpen state, handleTemplateUpload(), createNewTemplate()
- BrandHub.js: Added Create Template Dialog with form fields and upload
- StudioEditor.js: Added saveAsTemplateOpen state, handleSaveAsTemplate()
- StudioEditor.js: Added Save as Template button and dialog

**Testing Results:**
- Backend: 11/11 tests pass (100%)
- Frontend: All 7 features verified
- Test report: `/app/test_reports/iteration_75.json`

### Session: Mar 02, 2026 - Feed View & Instagram Integration ✅

#### Feed View with Scheduled Posts (User Request)
- **Goal**: Display scheduled posts in a Feed preview (Instagram-style grid)
- **Status**: ✅ COMPLETE

**Implementation:**
- FeedTab already integrated in SocialMediaPage at `/demand-studio/social`
- Tabs: Overview | Ideas | Calendar | Queue | **Feed** | Settings
- Feed filters: Planned | Published | Mixed | Original | Styled
- Stats cards: Scheduled this week, Posted this month, Pending ideas, Campaign-linked
- Empty state: "No scheduled or draft posts"
- Endpoints working: `/api/studio/feed/planned`, `/api/studio/feed/mixed`

#### Instagram Integration - Read Only (User Request)
- **Goal**: Connect Instagram Business account to display published posts
- **Status**: ✅ COMPLETE (MOCKED - no real IG API)

**Implementation:**
- Instagram Connection Card in Settings > Integrations
- Connect flow: Button triggers mock OAuth (in production would redirect to IG OAuth)
- Connected state shows: @username, Active badge, Sync button, Disconnect button
- Permission check fixed to use `user.role` directly (was failing on membership lookup)

**Backend Endpoints:**
- GET `/api/studio/instagram/connection` - Returns connection status
- POST `/api/studio/instagram/connect` - Creates connection (mock OAuth)
- DELETE `/api/studio/instagram/disconnect` - Removes connection
- POST `/api/studio/instagram/sync` - Triggers media sync (MOCKED)
- GET `/api/studio/instagram/media` - Returns cached media

**Files Modified:**
- `frontend/src/pages/demand-studio/DemandStudioSettings.js` - Added Instagram section
- `backend/routers/studio.py` - Fixed permission check (line 413)

**Testing Results:**
- Backend: 11/11 tests pass (100%)
- Frontend: All features verified
- Test report: `/app/test_reports/iteration_76.json`

**Note:** Instagram integration is MOCKED. In production, would need:
- Meta Developer App registration
- Instagram Graph API OAuth flow
- Token refresh mechanism
- Real media caching

### Session: Mar 02, 2026 - Real Instagram OAuth Multi-Tenant ✅

#### Instagram OAuth 2.0 (User Request: "Simple sign in like Tezza")
- **Goal**: Real Instagram login flow that works multi-tenant (each client connects their own IG)
- **Status**: ✅ COMPLETE (Pending Meta App credentials)

**Implementation:**
- Created new router: `backend/routers/instagram_oauth.py`
- OAuth 2.0 flow with CSRF state protection
- Multi-tenant: ONE Kora Meta App, each tenant connects their own IG account
- Token storage encrypted per tenant
- Automatic token refresh (60-day long-lived tokens)

**New Endpoints:**
- `GET /api/instagram/oauth/start` - Returns Instagram auth URL
- `GET /api/instagram/oauth/callback` - Handles OAuth callback, exchanges code for token
- `POST /api/instagram/oauth/refresh` - Refreshes token before expiry
- `GET /api/instagram/media` - Fetches user's media with caching
- `GET /api/instagram/profile` - Gets user profile info

**Frontend Changes:**
- `DemandStudioSettings.js` - Updated connect flow to use real OAuth
- Handles OAuth callback params (ig_success, ig_error, ig_username)
- Shows appropriate error when IG not configured

**Configuration Required:**
Add to `/app/backend/.env`:
```
INSTAGRAM_APP_ID=your_meta_app_id
INSTAGRAM_APP_SECRET=your_meta_app_secret
```

**Documentation:**
- Created `/app/docs/INSTAGRAM_SETUP.md` with full setup guide
- Includes Meta App creation, permissions, redirect URIs

**Testing Results:**
- Backend: 12/12 tests pass (100%)
- Frontend: All OAuth flows verified
- Test report: `/app/test_reports/iteration_77.json`

### Session: Mar 02, 2026 - Social Media Sharing for External Agencies ✅

#### Share Social Media with Marketing Agencies (User Request)
- **Goal**: Allow sharing Social Media module with external agencies (multi-tenant)
- **Status**: ✅ COMPLETE

**Features Implemented:**

1. **Internal Collaborators (Kora Users)**
   - Invite Kora users as "Social Viewer" or "Social Contributor"
   - Users see the organization in their Kora account
   - Permissions: Viewer (read-only), Contributor (view + create drafts/ideas)
   - Manage invitations and remove collaborators

2. **External Share Links (Non-Kora Users)**
   - Create public links with optional password protection
   - Configurable expiry (7 days, 30 days, 90 days, 1 year, never)
   - Permissions: Viewer or Contributor
   - Track access count and last accessed date
   - Revoke links at any time

**Backend Endpoints (`/api/social-sharing/`):**
- `GET /collaborators` - List collaborators and pending invitations
- `POST /collaborators/invite` - Invite a Kora user
- `DELETE /collaborators/{membership_id}` - Remove collaborator
- `GET /links` - List active share links
- `POST /links` - Create share link
- `DELETE /links/{share_id}` - Revoke link
- `POST /access/validate` - Public endpoint for external access
- `GET /external/social-posts` - Posts for external viewers
- `GET /external/ideas` - Ideas for external viewers
- `POST /external/ideas` - Create idea as external contributor
- `POST /external/drafts` - Create draft as external contributor

**Frontend:**
- New component: `SocialSharing.js`
- Integrated in Social Media > Settings > "Share with Agencies" section
- Dialogs for inviting collaborators and creating links
- Copy to clipboard functionality

**Bug Fixed by Testing Agent:**
- SelectItem with empty value caused React error - Changed to value="never"

**Testing Results:**
- Backend: 16/16 tests pass (100%)
- Frontend: 100% - All UI components verified
- Test report: `/app/test_reports/iteration_78.json`

**Files Created/Modified:**
- `backend/routers/brand_hub.py` (Bug fix)
- `frontend/src/pages/demand-studio/CampaignDetailPage.js` (DNA tab added)
- `frontend/src/components/demand-studio/CampaignDNA.js` (created)
- `frontend/src/components/demand-studio/BrandHub.js` (created)
