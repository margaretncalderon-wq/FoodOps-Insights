# Kora OS — Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called **Kora OS** with modules for People Ops, Business, Demand Studio, Event Orchestration, and CRM. Core focus: Demand Studio (Social Media), CRM scaling, Event Orchestration, global System Settings (i18n, timezone, currency), and a dedicated Launch experience for the May 1–3, 2026 event.

## Target Users
- LATAM creative-industry operators (events, catering, agencies, professional services).
- Bilingual (ES default / EN) with multi-currency and ITBIS tax support.

## Core Architecture
- **Backend**: FastAPI (`/app/backend`), MongoDB, modular routers under `/app/backend/routers`.
- **Frontend**: React (`/app/frontend/src`), Tailwind + Shadcn UI, React Router.
- **Internal modules order (general → specific)**: System Pulse → Client Engagement → Execution Hub → Partners → Business Clarity → Demand Generation → Event Orchestration → Culinary Intelligence → Resource Management → Venues → People Ops → Settings.

## Sprint History (Completed)
- Sprint 1: Auth + multi-tenant orgs.
- Sprint 2: CRM + pipeline + leads + clients.
- Sprint 3: Event Orchestration + run-of-show + venues.
- Sprint 4: Email Marketing base + i18n + Locale Settings (currency/timezone).
- Sprint 5 (Q1 2026): Demand Studio expansion (story series, calendar D/W/M, format colors, recurring posts, IG-style feed preview).
- Sprint 6 (Apr 2026): CRM Map (react-leaflet), Dashboard funnel/pipeline alignment, in-app notifications on conversion, follow-ups dialog, Execution Hub privacy, company_entity_id migration.

## Latest Release — Launch Kit (Apr 29, 2026)
**Goal**: Drive traction and exclusivity for the May 1–3, 2026 stand event.

**Backend**
- `routers/launch.py` — Waitlist + Founding 100 logic.
  - `POST /api/launch/waitlist` (email validation, idempotent, auto-assigns founding_position 1–100).
  - `GET /api/launch/stats` (founding_cap, founding_claimed, founding_remaining, event_dates).
- MongoDB collection `launch_waitlist`.

**Frontend** — `pages/LandingPage.js` rebuilt:
- Sticky **launch banner** with live countdown to May 1, 2026 09:00 EST.
- New **Kora OS logo** (`/public/kora-logo.png`) in header + footer.
- Hero: dual CTA (Founding 100 / Visit our stand) + interactive mockup stack.
- **Event section** (`#event`): stand context, 3-day card grid, RSVP form bound to `/api/launch/waitlist`.
- **Modules tabs** (10) in the same order as the in-app sidebar, each with a unique realistic mock visual (KPIs, pipeline, OKRs, cash flow, IG grid, run-of-show, recipe cost, inventory, venue layout, team).
- **Differentiators** (4) replace vanity stats.
- **Founding 100 section** (`#founding`): live scarcity counter, 5 benefits, 30% off year 1 offer + form.
- Pricing: $48/mo strikethrough $69 + Founder 100 banner.

## Test Credentials
See `/app/memory/test_credentials.md`.

## Key Endpoints
- `POST /api/launch/waitlist`
- `GET /api/launch/stats`
- `GET /api/studio/feed/planned`, `GET /api/studio/feed/mixed`
- `POST /api/crm/leads`, `GET /api/crm/pipeline`
- `POST /api/auth/login`, `POST /api/auth/register`

## Backlog (Prioritized)
**P1**
- Logo image upload via Object Storage for guest flow.
- Unified Contact Model (merge Lead + Client into single lifecycle entity).
- Unify Communications components.
- Email confirmation drip (post-waitlist) — SendGrid/Resend.

**P2**
- Refactor `SocialMediaPage.js` (~4300 lines).
- Staffdo.com / Meta IG / TikTok APIs.
- WhatsApp Business API integration.
- Founder Discord auto-invite via webhook.
- Admin dashboard view of `launch_waitlist` (export CSV, mark contacted).

**P3**
- A/B test Founding 100 copy.
- Add testimonials section once 3+ beta clients live.
- Conference QR code routing → `/launch?source=qr-stand`.

## Last Working Item
Launch Kit complete (Apr 29, 2026). Backend tested with curl (founder, idempotency, email validation). Frontend visually verified ES + EN, all sections rendering.
