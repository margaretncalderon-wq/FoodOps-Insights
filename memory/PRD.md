# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard overview with My Pending widget
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Execution Hub** - ✨ NEW: Operational goals, tasks, decisions tracking
7. **Demand Studio** - Marketing campaigns, social media
8. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented

### February 7, 2026 - Execution Hub Complete ✅

#### Backend (Phase 1) - 100% Complete
- Full CRUD for Goals, Tasks, Decisions, Dependencies, Notes
- Plan-based limits (Starter: 3 goals/month, Pro/Enterprise: unlimited)
- Access control with roles (owner, team_member, collaborator, viewer)
- System Pulse integration endpoints
- **18/18 backend tests passed**

#### Frontend (Phase 2) - 100% Complete
- **ExecutionHubPage.js:** Main goals list with stats, filters, search
- **ExecutionGoalDetail.js:** Detail view with tabs (Tasks, Decisions, Dependencies, Notes)
- **Dashboard.js:** "My Pending" widget integrated in System Pulse
- **Layout.js:** Navigation link in sidebar
- **16/16 frontend tests passed**

#### Add-ons Marketplace - Complete
- Infrastructure for individual purchases
- 8 add-ons available (users, events, storage, features)

### Previous Session (February 6)
- Asset Value Report in Business Clarity
- OperationsSuppliesPage refactoring (2718 → 92 lines)
- Google OAuth fix
- Database indexing for performance

## API Endpoints - Execution Hub

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/execution-hub/usage | Usage stats vs limit |
| GET | /api/execution-hub/goals | List all goals |
| POST | /api/execution-hub/goals | Create goal |
| GET | /api/execution-hub/goals/{id} | Get goal details |
| PUT | /api/execution-hub/goals/{id} | Update goal |
| DELETE | /api/execution-hub/goals/{id} | Delete goal |
| POST | /api/execution-hub/goals/{id}/tasks | Create task |
| PUT | /api/execution-hub/tasks/{id} | Update task |
| POST | /api/execution-hub/tasks/{id}/notes | Add task note |
| POST | /api/execution-hub/goals/{id}/decisions | Add decision |
| POST | /api/execution-hub/goals/{id}/dependencies | Add dependency |
| GET | /api/execution-hub/my-pending | My pending widget data |
| GET | /api/execution-hub/signals | System Pulse signals |

## API Endpoints - Add-ons

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/addons/marketplace | Available add-ons |
| GET | /api/addons/effective-limits | Plan + addons limits |
| GET | /api/addons/effective-features | Plan + addons features |
| POST | /api/addons/purchase | Purchase add-on |

## Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| /execution-hub | ExecutionHubPage | Goals list |
| /execution-hub/:goalId | ExecutionGoalDetail | Goal detail |

## Pending Issues
- **P2:** Local DB data not persisted
- **P3:** Admin subdomain (admin.ourkora.com) SSL

## Completed Tasks ✅
- Execution Hub Backend (P0) - DONE
- Execution Hub Frontend (P0) - DONE
- Add-ons Infrastructure (P0) - DONE

## Upcoming Tasks
- **P1:** Email notifications activation (pending RESEND_API_KEY)
- **P1:** Complete server.py refactoring (events.py migration)
- **P1:** Social Media Campaign Widget
- **P2:** Multi-language EN/ES for Execution Hub labels

## Future Tasks
- Venue Management module
- Email Purchase Orders to suppliers
- Multi-currency support
- Operating margin alerts
- End-of-month summary emails

## Test Reports
- Backend: `/app/test_reports/iteration_31.json` - 18/18 passed
- Frontend: `/app/test_reports/iteration_32.json` - 16/16 passed

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://executionhq.preview.emergentagent.com
- Production: https://ourkora.com

## New Files Created
- `/app/frontend/src/pages/ExecutionHubPage.js`
- `/app/frontend/src/pages/ExecutionGoalDetail.js`
- `/app/backend/routers/execution_hub.py`
- `/app/backend/models/execution_hub.py`
- `/app/backend/routers/addons.py`
- `/app/backend/models/addons.py`

## Modified Files
- `/app/frontend/src/App.js` - Added routes
- `/app/frontend/src/components/Layout.js` - Added sidebar link
- `/app/frontend/src/pages/Dashboard.js` - Added My Pending widget
- `/app/backend/server.py` - Added routers and plan limits
- `/app/backend/config.py` - Added indexes
