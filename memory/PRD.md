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

### P1 - Upcoming
- **Email Marketing Híbrido**: Tracker mejorado + envío simple de emails one-off (requiere API key Resend/SendGrid)
- **WhatsApp Business API**: Integración oficial de Meta para marketing por WhatsApp
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
