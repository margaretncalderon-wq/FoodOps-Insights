# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard with Execution Signals & My Pending widgets
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Execution Hub** - ✅ COMPLETE: Operational goals, tasks, decisions tracking
7. **Demand Studio** - Marketing campaigns, social media
8. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented - Execution Hub Complete ✅

### February 7, 2026

#### Phase 1: Backend - 100% Complete
- Full CRUD for Goals, Tasks, Decisions, Dependencies, Notes
- Plan-based limits (Starter: 3/month, Pro/Enterprise: unlimited)
- Role-based access control
- **18/18 backend tests passed**

#### Phase 2: Frontend - 100% Complete
- **ExecutionHubPage.js:** Goals list with stats, filters, search
- **ExecutionGoalDetail.js:** Detail view with tabs
- **16/16 frontend tests passed**

#### Phase 3: System Pulse Integration - 100% Complete ✅
- **Execution Signals Section:**
  - Critical (red) alerts for blocked goals
  - Warning (yellow) alerts for at-risk goals (deadline < 7 days)
  - Success indicators for completed goals this week
  - Direct links to goal details
  
- **My Pending Widget Enhanced:**
  - Counters: Active Goals | Tasks | Blocked
  - "My Goals" list with status badges
  - "Assigned Tasks" list with due dates
  - Click-through navigation

- **12/12 integration tests passed**

#### Add-ons Marketplace - Complete
- Infrastructure for individual purchases
- 8 add-ons available

### Test Results Summary
| Phase | Tests | Passed | Status |
|-------|-------|--------|--------|
| Backend | 18 | 18 | ✅ 100% |
| Frontend | 16 | 16 | ✅ 100% |
| Integration | 12 | 12 | ✅ 100% |
| **Total** | **46** | **46** | **✅ 100%** |

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
| **GET** | **/api/execution-hub/my-pending** | **My Pending widget data** |
| **GET** | **/api/execution-hub/signals** | **System Pulse signals** |

## Frontend Components

### New Files
- `/app/frontend/src/pages/ExecutionHubPage.js` - Main goals list
- `/app/frontend/src/pages/ExecutionGoalDetail.js` - Goal detail with tabs

### Modified Files
- `/app/frontend/src/pages/Dashboard.js` - Execution Signals + My Pending widgets
- `/app/frontend/src/components/Layout.js` - Sidebar navigation
- `/app/frontend/src/App.js` - Routes

## Current Test Data
- **Goal 1:** "Reducir costos operativos Q1" (status: planning)
- **Goal 2:** "Preparar evento VIP urgente" (status: blocked)
- **Task:** "Revisar contratos con proveedores" (on Goal 1)

## Pending Issues
- **P2:** Local DB data not persisted
- **P3:** Admin subdomain (admin.ourkora.com) SSL

## Completed Tasks ✅
- ✅ Execution Hub Backend
- ✅ Execution Hub Frontend
- ✅ System Pulse Integration (Signals + My Pending)
- ✅ Add-ons Infrastructure

## Upcoming Tasks
- **P1:** Email notifications (pending RESEND_API_KEY)
- **P1:** Complete server.py refactoring
- **P1:** Social Media Campaign Widget
- **P2:** Multi-language EN/ES labels

## Future Tasks
- Venue Management module
- Email Purchase Orders
- Multi-currency support
- Operating margin alerts

## Test Reports
- `/app/test_reports/iteration_31.json` - Backend 18/18
- `/app/test_reports/iteration_32.json` - Frontend 16/16
- `/app/test_reports/iteration_33.json` - Integration 12/12

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://executionhq.preview.emergentagent.com
- Production: https://ourkora.com
