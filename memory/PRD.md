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
- Filter/group leads and clients by City/Country
- Complete Dynamic Terminology Coverage
- Normalize lead statuses to single source of truth

### P2 - Blocked
- Super Admin access for `admin@staffdo.com` (needs DB permission fix)
- Google OAuth in preview environments (redirect_uri_mismatch)
- Email Notifications (waiting for RESEND_API_KEY)

### Future/Backlog
- Kanban-style view for leads
- Social Media Campaign Widget
- Marketing Budget Management
- API Documentation page

## Key Technical Details

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
