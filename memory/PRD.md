# Kora OS - Product Requirements Document

## Original Problem Statement
Multi-tenant SaaS platform where terminology, modules, and features dynamically adapt based on organization industry. Core model: Kora Core base + optional paid add-ons with 7-day free trial.

## Architecture
- **Frontend**: React + Shadcn UI + TailwindCSS
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: Custom Google OAuth + Emergent Session Exchange + JWT/Password
- **Payments**: Stripe
- **Email**: Resend (BLOCKED - pending API key)

## What's Been Implemented
- Multi-industry support (events, agency, consulting, generic)
- Dynamic module system with industry-specific filtering
- Subscription plans (starter, professional, enterprise)
- Add-on marketplace with module add-ons
- CRM (leads, contacts, clients)
- Event Orchestration / Program Orchestration
- Culinary Intelligence, Resource Management, Venues
- Business Clarity (financial dashboards)
- Execution Hub (goals/tasks)
- Demand Studio (marketing)
- Super Admin Panel
- Landing Page with integration logos
- Workflow Builder UI (Automations tab in Settings)
- Google OAuth + Emergent OAuth login
- Demo/Influencer account creation

## Recent Fix (Feb 2026)
### P0: Module Loading Regression - FIXED & VERIFIED
- **Root Cause**: Existing users (especially Google login) were missing `organization_config` and/or `subscription` records, causing `enabled-modules` endpoint to return minimal modules.
- **Fix**: Created `ensure_user_data_complete()` helper in `auth.py` that back-fills missing `organization_config` (with `industry_type`) and `subscription` (with `plan_professional` trial) on every login/session.
- **Applied to**: Password login, Emergent session exchange, Google OAuth callback
- **Also fixed**: Potential `NameError` in register endpoint when `industry_type` not provided
- **Testing**: 17/17 backend tests passed

## Pending Issues
- P2: Incomplete internationalization (hardcoded strings in UI)
- P3: Backend plan limit enforcement logic
- P3: Email Notifications (blocked on RESEND_API_KEY)

## Upcoming Tasks
- P1: Backend workflow configuration (connect Automations UI to backend)
- P2: Refactor server.py into dedicated routers
- P3: API Documentation in Super Admin panel

## Future/Backlog
- Social Media Campaign Widget
- User Data Migration
- Marketing Budget Management
- Email Purchase Orders, Multi-currency, Negative Margin Alerts
- End-of-month summaries

## Key Credentials (Preview)
- Demo: demo.agency@kora.com / Evoque2024!
