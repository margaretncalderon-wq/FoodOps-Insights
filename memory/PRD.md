# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard with Execution Signals & My Pending widgets
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution (dynamic terminology per industry)
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Execution Hub** - Operational goals, tasks, decisions tracking
7. **Venues & Locations** - Company venues, rooms, event locations, room availability
8. **Demand Studio** - Marketing campaigns, social media
9. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## Business Model
- **Kora Core - $69/mes** (suscripción obligatoria)
  - Incluye: System Pulse, Execution Hub, Client Engagement, Business Clarity, 1 Location
- **Add-ons opcionales:**
  - Event Suite - $39/mes (Event Orchestration + Venues combinados)
  - Culinary Intelligence - $29/mes
  - Operations Supplies - $19/mes
  - Demand Studio - $39/mes
- **Trial de 7 días** aplica a todo (Core + Add-ons)

## Industry Templates
1. **Events & Hospitality** - Catering, weddings, corporate events
   - Entity: "Event"
   - Modules: Event Orchestration, Culinary Intelligence, Resource Management, Venues, Demand Studio
2. **Professional Services** - Consulting, agencies, legal
   - Entity: "Project"
   - Modules: Program Orchestration, Demand Studio
3. **Generic** - General service businesses
   - Entity: "Service"
   - Modules: Program Orchestration, Resource Management, Demand Studio

## Recent Changes (February 19, 2026)

### Add Users to Organizations from Admin Panel - NEW ✅
- **Backend:** `POST /api/super-admin/organizations/{company_id}/members`
  - Creates new user with email, name, password, and role
  - Can add existing user to another organization
  - Email validation and duplicate check
  - Admin action logging
- **Frontend:** "Agregar Usuario" dialog in Members tab
  - Fields: Name, Email, Password (with generator), Role selector
  - Roles: owner, admin, ops, finance, viewer
  - Cancel/Add User buttons

### Fixed Missing organization_configs for Existing Users ✅
- 18 organizations were missing `organization_configs` records
- Created migration script to fix all existing organizations
- Now all users correctly inherit industry-specific terminology and modules

## API Endpoints - Super Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/super-admin/organizations | List all organizations |
| GET | /api/super-admin/organizations/{id} | Get organization details |
| GET | /api/super-admin/organizations/{id}/members | List members |
| POST | /api/super-admin/organizations/{id}/members | **NEW** Add user to organization |
| PUT | /api/super-admin/organizations/{id}/members/{id}/role | Change member role |
| DELETE | /api/super-admin/organizations/{id}/members/{id} | Remove member |
| DELETE | /api/super-admin/organizations/{id} | Delete organization |
| PUT | /api/super-admin/organizations/{id}/account-type | Change account type |
| POST | /api/super-admin/users/{id}/reset-password | Reset user password |

## Credentials
### Events/Catering User
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!
- Industry: events (Events & Hospitality)

### Agency User (Super Admin)
- Email: demo.agency@kora.com
- Password: Evoque2024!
- Industry: agency (Professional Services)
- is_super_admin: true

## URLs
- Preview: https://kora-core-launch.preview.emergentagent.com
- Production: https://ourkora.com

## Pending Issues
1. **P1:** Org-Level Workflow Configuration UI
2. **P2:** Refactor server.py into smaller router modules
3. **P2:** Complete i18n audit for new components
4. **P3:** API Documentation page for Super Admin

## Blocked Items
- **Email Functionality:** Awaiting `RESEND_API_KEY` for transactional emails

## Future Tasks
- Social Media Campaign Widget
- User Data Migration Assistance
- Marketing Budget Management
- Email Purchase Orders
- Multi-currency Support
- Negative Margin Alerts
- End-of-month Summaries

## Test Reports
- Latest: `/app/test_reports/iteration_229.json`
