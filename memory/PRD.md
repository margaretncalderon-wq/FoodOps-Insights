# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard overview
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Demand Studio** - Marketing campaigns, social media
7. **Business Clarity** - Finance, invoices, reports
8. **Execution Hub** - ✨ NEW: Operational goals, tasks, decisions tracking

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented

### February 7, 2026 (Current Session)

#### Execution Hub Module - Backend Complete ✅
- **Goals Management:**
  - Full CRUD for execution goals with status tracking (planning, in_progress, blocked, live, archived)
  - Context types: event, department, organizational, personal
  - Impact areas: cost, quality, speed, risk
  - Plan-based limits (Starter: 3 goals/month, Professional/Enterprise: unlimited)
  
- **Tasks System:**
  - Create/update tasks with automatic change log
  - Multiple assignees support
  - Task-level notes (comments thread)
  - Status: pending, in_progress, completed, blocked
  
- **Decision Log:**
  - Record decisions with rationale
  - Timestamp and user attribution
  
- **Dependencies:**
  - Track blockers with status (pending, resolved, blocked)
  
- **Linked Items:**
  - Connect goals to events, vendors, menus, supplies
  
- **Access Control:**
  - Roles: owner, team_member, collaborator, viewer
  - External collaborator support (is_external flag)
  
- **System Pulse Integration:**
  - `/api/execution-hub/my-pending` - Widget for user's pending items
  - `/api/execution-hub/signals` - Blocked goals, at-risk goals alerts

#### Add-ons Marketplace System - Complete ✅
- **Infrastructure for individual purchases separate from plan:**
  - Limit boosts (extra users, events, storage, execution goals)
  - Feature unlocks (culinary intelligence, advanced reports)
  - Services (priority support, white label)
  
- **Available Add-ons:**
  - Extra Users Pack (+5) - $15/month
  - Extra Events Pack (+10) - $19/month
  - Extra Storage (+1GB) - $5/month
  - Unlimited Execution Goals - $9/month (Starter only)
  - Culinary Intelligence Module - $25/month (Starter only)
  - Advanced Reports - $15/month (Starter only)
  - Priority Support - $29/month
  - White Label Branding - $49/month

- **API Endpoints:**
  - `GET /api/addons/marketplace` - List available add-ons
  - `GET /api/addons/effective-limits` - Plan + addons limits
  - `GET /api/addons/effective-features` - Plan + addons features
  - `GET /api/addons/subscription-summary` - Complete summary
  - `POST /api/addons/purchase` - Purchase add-on
  - `DELETE /api/addons/{id}` - Cancel add-on

#### Plan Updates
- Added `execution_goals_per_month` limit to all plans
- Added `execution_hub: true` feature flag (enabled for all)
- Starter: 3 goals/month | Professional/Enterprise: unlimited (999)

### February 6, 2026 (Previous Session)
- **Asset Value Report in Business Clarity**
- **OperationsSuppliesPage.js Refactoring** (2718 → 92 lines)
- **Events Router Extraction** (started)
- **Super Admin UI improvements**
- **Google OAuth fix** (redirect_uri_mismatch resolved)
- **Performance optimizations** (MongoDB indexes)

## API Endpoints - Execution Hub

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/execution-hub/usage | Get goals usage vs limit |
| GET | /api/execution-hub/goals | List all goals |
| POST | /api/execution-hub/goals | Create goal |
| GET | /api/execution-hub/goals/{id} | Get goal with details |
| PUT | /api/execution-hub/goals/{id} | Update goal |
| DELETE | /api/execution-hub/goals/{id} | Delete goal + related |
| POST | /api/execution-hub/goals/{id}/tasks | Create task |
| GET | /api/execution-hub/goals/{id}/tasks | List tasks |
| PUT | /api/execution-hub/tasks/{id} | Update task |
| POST | /api/execution-hub/tasks/{id}/notes | Add task note |
| POST | /api/execution-hub/tasks/{id}/assignees | Add assignee |
| DELETE | /api/execution-hub/tasks/{id}/assignees/{uid} | Remove assignee |
| POST | /api/execution-hub/goals/{id}/decisions | Add decision |
| POST | /api/execution-hub/goals/{id}/dependencies | Add dependency |
| PUT | /api/execution-hub/dependencies/{id} | Update dependency |
| POST | /api/execution-hub/goals/{id}/linked-items | Link item |
| DELETE | /api/execution-hub/goals/{id}/linked-items/{iid} | Unlink item |
| POST | /api/execution-hub/goals/{id}/access | Invite collaborator |
| DELETE | /api/execution-hub/goals/{id}/access/{aid} | Remove collaborator |
| GET | /api/execution-hub/my-pending | My pending widget |
| GET | /api/execution-hub/signals | System Pulse signals |

## Pending Issues
- **P2:** Local DB data not persisted (workaround in dependencies.py)
- **P3:** Admin subdomain (admin.ourkora.com) SSL configuration

## In Progress Tasks
- **P0:** Execution Hub Frontend Implementation
- **P1:** Complete backend refactoring (server.py → events.py)

## Upcoming Tasks
- **P0:** Execution Hub Frontend UI (Goals list, detail view, task management)
- **P0:** System Pulse integration (My Pending widget, Execution Signals)
- **P1:** Email notifications activation (pending RESEND_API_KEY)
- **P1:** Social Media Campaign Widget
- **P2:** Multi-language support for Execution Hub (EN/ES)

## Future Tasks
- Venue Management module
- Email Purchase Orders to suppliers
- Multi-currency support
- Alert notifications for negative operating margin
- End-of-month summary emails

## Integrations
- **Stripe:** Payment processing ✅
- **Google OAuth:** Social login ✅
- **Resend:** Transactional emails (PENDING API KEY)

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://executionhq.preview.emergentagent.com
- Production: https://ourkora.com

## Database Collections (Execution Hub)
- `execution_goals` - Main goals collection
- `execution_tasks` - Tasks with assignees and change log
- `execution_decisions` - Decision log
- `execution_dependencies` - Blockers and dependencies
- `execution_access` - Collaborator access permissions
- `addon_definitions` - Available add-ons catalog
- `organization_addons` - Purchased add-ons per organization
