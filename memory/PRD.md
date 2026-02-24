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
- **Implement Campaign Detail Tabs**: CampaignDetailPage has placeholder tabs (Activations, Social Media, Spend, Leads)
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
