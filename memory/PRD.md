# Kora OS — Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called **Kora OS** with modules for People Ops, Business, Demand Studio, Event Orchestration, and CRM. Core focus: Demand Studio (Social Media), CRM scaling, Event Orchestration, global System Settings (i18n, timezone, currency), and a dedicated Launch experience for the May 1–3, 2026 event.

## Target Users
- LATAM creative-industry operators (events, catering, agencies, professional services).
- Bilingual (ES default / EN) with multi-currency and ITBIS tax support.

## Core Architecture
- **Backend**: FastAPI (`/app/backend`), MongoDB, modular routers under `/app/backend/routers`. APScheduler for background jobs.
- **Frontend**: React (`/app/frontend/src`), Tailwind + Shadcn UI + Plus Jakarta Sans, React Router.
- **Internal modules order (general → specific)**: System Pulse → Client Engagement → Execution Hub → Partners → Business Clarity → Demand Generation → Event Orchestration → Culinary Intelligence → Resource Management → Venues → People Ops → Settings.

## Sprint History (Completed)
- Sprint 1: Auth + multi-tenant orgs.
- Sprint 2: CRM + pipeline + leads + clients.
- Sprint 3: Event Orchestration + run-of-show + venues.
- Sprint 4: Email Marketing base + i18n + Locale Settings (currency/timezone).
- Sprint 5 (Q1 2026): Demand Studio expansion (story series, calendar D/W/M, format colors, recurring posts, IG-style feed preview).
- Sprint 6 (Apr 2026): CRM Map (react-leaflet), Dashboard funnel/pipeline alignment, in-app notifications on conversion, follow-ups dialog, Execution Hub privacy, company_entity_id migration.
- Sprint 7 (Apr-May 2026): Launch kit (May 1-3 event), tipografía Plus Jakarta Sans global, Bug fixes (Recipe whitescreen, Demand Studio post overwrite), Performance Dashboard CRM.

## Latest Releases

### Culinary UX — Live Cost Preview + Wizard + Review Banner (Feb 14, 2026)
**Goal**: Real-time recipe costing + chef-friendly tools to repair inconsistent ingredient data.

**Backend**
- `POST /api/inventory/ingredients/cost-preview` — Live cost computation per recipe line. Returns `{cost, compatible, base_unit, quantity_in_base, ingredient_unit_kind, message}`. Handles unit conversions (weight↔weight, volume↔volume, weight↔volume via density).
- `IngredientCreate`/`Ingredient` models exposed v2 fields: `base_unit`, `cost_per_base_unit`, `density_g_per_ml`, `purchase_unit`, `purchase_quantity_per_unit`, `purchase_cost`, `needs_review`.

**Frontend**
- `RecipeBuilder.js` → new `IngredientRow` sub-component shows live cost with 4-decimal precision, ⚠️ warning + amber styling for incompatible units, base-unit conversion line below cost.
- `IngredientWizard.js` (new): 4-step guided dialog (Identity → Purchase → Base Unit & Density → Review) with smart defaults (base_unit suggested from category, density auto-hint for oils/water/honey/milk/etc.).
- `FoodOpsPage.js` → Items tab: amber `Review Banner` showing count of ingredients needing repair, opens drawer listing them with per-row "Fix" button that pre-loads the wizard in repair mode. "Wizard" button next to Import/Add Item for guided new-ingredient creation.

**Tests**: Backend 100% (10/10 cost-preview + 8/8 wizard API). Frontend 100% (all wizard flows + banner + drawer verified, name pre-load fixed via component key).

### Performance Dashboard CRM — May 10, 2026
**Goal**: Daily/weekly/monthly performance tracking per salesperson with deltas, leaderboard and alerts.

**Backend**
- `GET /api/crm/reports/performance` — granularity day/week/month, period_offset navigation, returns KPIs+delta, leaderboard with score, sparklines, alerts.
- `POST /api/crm/admin/cleanup-comm-logs` — backfill owner_id, comm_type, log_id (idempotent).
- `POST /api/crm/reports/notify-admin-alerts` — notify org admins via in-app (idempotent per day).
- `scheduler.py` — APScheduler running daily 9am `America/Santo_Domingo` to send alerts automatically.

**Frontend**
- `components/crm/PerformanceTab.js` — replaces "Daily Activity" tab in Sales Report.
- Day/Week/Month tabs + `< Now >` period navigation.
- 12 KPI cards (calls, emails, whatsapp, meetings, notes, new_leads, conversions, follow_ups, proposals, pipeline_value, revenue_closed) each with delta %.
- Team Leaderboard with podium 🥇🥈🥉, sparklines per owner, score bar, goal_pct badge, alert badges.
- Alerts banner with "Notify admins" button.
- Cleanup button integrated.
- Auto "Mi Performance" view for sales role users.

### Bug Fixes — May 7-10, 2026
- **Recipe whitescreen fix**: `RecipeBuilder.js` (3 files) — instructions sent as string (not array), error handler safely stringifies pydantic 422 array errors.
- **Demand Studio post overwrite fix**: `SocialMediaPage.js` — clear `editingPost` state in dialog onOpenChange + on "New Post" button click. Prevents PUT on stale post when user closed edit dialog with X then created a new post.

### Launch Kit — Apr 29, 2026
**Backend**
- `routers/launch.py` — `POST /api/launch/waitlist` + `GET /api/launch/stats` for Founding 100.

**Frontend** — `pages/LandingPage.js` rebuilt:
- New Kora OS logo, sticky launch banner with countdown to May 1, 2026 09:00 EST.
- Hero with dual CTA + interactive mockup stack.
- Event section with stand info + RSVP form.
- 10 module tabs in same order as in-app sidebar with realistic mock visuals.
- Differentiators replacing vanity stats.
- Founding 100 with live scarcity counter, 30% off year 1 offer.
- Pricing $48/mo strikethrough $69 + Founder 100 banner.

### Typography — May 7, 2026
- Title font changed from Playfair Display (serif) to Plus Jakarta Sans (sans-serif).
- Letter-spacing tightened to -0.035em for modern feel.

## Test Credentials
See `/app/memory/test_credentials.md`.

## Key Endpoints
- `GET /api/crm/reports/performance`
- `POST /api/crm/admin/cleanup-comm-logs`
- `POST /api/crm/reports/notify-admin-alerts`
- `POST /api/launch/waitlist` · `GET /api/launch/stats`
- `GET /api/studio/feed/planned`, `GET /api/studio/feed/mixed`
- `POST /api/crm/leads`, `GET /api/crm/pipeline`
- `POST /api/auth/login`, `POST /api/auth/register`

## Backlog (Prioritized)

### P1
- Auto-update `clients.total_revenue` when an event is closed/confirmed.
- Backfill historical `clients.total_revenue` from confirmed events.
- Conversion-by-source report with revenue per channel.
- Logo image upload via Object Storage for guest flow.
- Unified Contact Model (merge Lead + Client into single lifecycle entity).
- Unify Communications components.
- Email confirmation drip post-waitlist (SendGrid/Resend).

### P2
- Refactor `SocialMediaPage.js` (~4400 lines).
- Staffdo.com / Meta IG / TikTok APIs.
- WhatsApp Business API integration.
- Cohort retention analysis (leads by month → conversion at 30/60/90d).
- Forecast based on weighted pipeline.
- Founder Discord auto-invite via webhook.
- Admin dashboard view of `launch_waitlist` (export CSV, mark contacted).

### P3
- A/B test Founding 100 copy.
- Add testimonials section once 3+ beta clients live.
- Conference QR code routing → `/launch?source=qr-stand`.
- Heatmap of activity (calendar tipo GitHub) per salesperson.

## Deployments
- PREVIEW: Auto-deployed to Emergent preview env on every change.
- PRODUCTION: https://ourkora.com (manual redeploy required after preview validation).

## Testing Status
- Latest test reports: `/app/test_reports/iteration_161.json` (Cost Health Dashboard + PicklistItem Staleness — backend 10/10 executed, frontend 6/6 testable; Food Ops section mode untested only because demo admin lacks Culinary module)
- Backend: 100%
- Frontend: 100% (testable surface)

## Last Working Item
Bug fix — Auto-recovery de 401 + cookie domain dinámico (May 14, 2026):
- **Reporte original**: Usuarios en producción (`ourkora.com`) eran enviados al `/login` al hacer "Nuevo Evento". Síntoma reportado: token aparentemente válido pero algún endpoint devolvía 401 y disparaba el interceptor.
- **Fix 1 (defensivo cookie)**: `get_cookie_domain()` en `auth.py` ahora deriva el dominio del request (Origin/Referer/Host) y solo cae al env var como fallback. Funciona en preview y producción sin necesidad de tocar el .env.
- **Fix 2 (UX)**: El interceptor de 401 en `frontend/src/utils/api.js` ahora:
  1. Intenta `POST /auth/refresh` silenciosamente
  2. Si refresca con éxito → reintenta la request original 1 vez (`_retry` flag)
  3. Solo redirige a `/login?expired=1` si el refresh también falla
  - Usa `refreshInFlight` (promesa compartida) para evitar refreshes concurrentes
- **Testing iteration_165**: Backend 13/13 PASS, Frontend regresión completa OK. No requiere acción del usuario final (sin limpiar cookies, sin re-login).

Cost Health Dashboard + Margin Policy Fase 1 (May 14, 2026):
- Política de margen jerárquica (ítem → categoría → tipo) en `company_settings.margin_policy` con defaults sembrados.
- `Recipe` y `PicklistItem` aceptan `min_margin_pct` opcional (override).
- `/cost-health/overview` expone `effective_min_margin` y `below_threshold`.
- Settings UI nueva: **Política de Margen** (Catálogos dropdown).
- CostHealthDashboard muestra badge "Bajo margen" en card y section.

Next: Fase 2 Margin (breakdown por tipo) · Fase 3 (gating Admin) · Logo upload Guest Flow · Unified Contact Model · Recipe scaling · Filterable recipe tags.
