# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard with Execution Signals & My Pending widgets
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Execution Hub** - ✅ Operational goals, tasks, decisions tracking
7. **Demand Studio** - Marketing campaigns, social media
8. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented

### February 7, 2026

#### Execution Hub - 100% Complete ✅
- **Backend (18/18 tests):** Goals, Tasks, Decisions, Dependencies, Notes, Access Control
- **Frontend (16/16 tests):** Goals list, detail view, tabs, dialogs
- **System Pulse Integration (12/12 tests):** Execution Signals, My Pending widget

#### Multi-Language Support (i18n) - Enhanced ✅
- Added 80+ new translation keys to LanguageContext for Execution Hub
- Both English and Spanish fully supported
- Status labels, UI elements, error messages all translated
- Translation function `t()` used throughout new components

#### Add-ons Marketplace - Complete ✅
- Infrastructure for individual purchases separate from plan
- 8 add-ons available with pricing and compatibility rules

### Test Results Summary
| Phase | Tests | Passed |
|-------|-------|--------|
| Backend | 18 | 18 ✅ |
| Frontend | 16 | 16 ✅ |
| Integration | 12 | 12 ✅ |
| **Total** | **46** | **46 ✅** |

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
| GET | /api/execution-hub/my-pending | My Pending widget |
| GET | /api/execution-hub/signals | System Pulse signals |

## Translation Keys Added (LanguageContext.js)

### Execution Hub Keys (EN/ES)
- `executionHub` / `Centro de Ejecución`
- `newGoal` / `Nueva Meta`
- `createGoal` / `Crear Meta`
- `goalTitle` / `Título`
- `goalObjective` / `Objetivo`
- `targetDate` / `Fecha Objetivo`
- `impactAreas` / `Áreas de Impacto`
- `tasks` / `Tareas`
- `decisions` / `Decisiones`
- `dependencies` / `Dependencias`
- Status: `planning`, `inProgress`, `blocked`, `completed`, `live`, `archived`
- Impact: `cost`, `quality`, `speed`, `risk`
- Context: `organizational`, `event`, `department`, `personal`

### System Pulse Keys (EN/ES)
- `executionSignals` / `Señales de Ejecución`
- `myPending` / `Mis Pendientes`
- `myGoals` / `Mis Metas`
- `assignedTasks` / `Tareas Asignadas`
- `activeGoals` / `Metas Activas`
- `blockedGoals` / `Bloqueadas`
- `atRisk` / `en riesgo`

## Files Modified for i18n

1. **LanguageContext.js** - Added 80+ translation keys
2. **ExecutionHubPage.js** - All strings use `t()` function
3. **ExecutionGoalDetail.js** - All strings use `t()` function
4. **Dashboard.js** - Execution sections use `t()` function

## Pending Issues
- **P2:** Local DB data not persisted
- **P3:** Admin subdomain SSL configuration

## Completed Tasks ✅
- ✅ Execution Hub Backend
- ✅ Execution Hub Frontend
- ✅ System Pulse Integration
- ✅ Add-ons Infrastructure
- ✅ i18n Enhancement for Execution Hub

## Upcoming Tasks
- **P1:** Email notifications (pending RESEND_API_KEY)
- **P1:** Server.py refactoring (extract remaining routers)
- **P1:** Social Media Campaign Widget

## Future Tasks
- Venue Management module
- Email Purchase Orders
- Multi-currency support

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
