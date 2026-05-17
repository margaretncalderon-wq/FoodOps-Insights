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
Sprint 6 — Notification Deeplinks (May 15, 2026) ✅ COMPLETED.

### Sprint 6 — Notification Deeplinks
Auto-open the most-urgent dialog with preselected context from in-app notification.

- **Backend** (`/app/backend/routers/culinary_digest.py`):
  - `dispatch_digest()` computes a top-level `primary_action: {type, link, label, event_id?, menu_id?}` using priority cascade: variance > staleness > low_stock > mise_en_place > menu_engineering > digest.
  - `link` is `/food-ops/menus?dialog={type}&event_id|menu_id={ctx}` consumable by the FE.
  - Stored in notification.link AND notification.metadata.primary_action AND culinary_digest_history.primary_action.
- **Frontend**:
  - `PlatedMenusSection` now uses `useSearchParams`. On mount, reads `dialog`/`event_id`/`menu_id` params, opens the matching dialog, scrolls to highlighted menu (data-menu-id={id}, ring-2 ring-amber-400), then clears params (no re-trigger).
  - `CostVarianceDialog` accepts `initialEventId` prop. When present, fetches `/api/cost-variance/event/{id}` and renders a prominent "focused event" card (data-testid=cv-focused-event) above the list with theoretical/actual/variance for that event. Closing the dialog clears the state.
- **Tests**: Backend 19/19 + frontend 100%. Report: `/app/test_reports/iteration_175.json`. Pytest: `/app/backend/tests/test_sprint6_deeplinks.py`.

### Sprint 5 — Culinary Weekly Digest (Previously Completed)
Multi-channel digest with 7 toggleable sections, email+in-app, scheduler job. iteration_174.json.

### Phase 2 + Enhancements — Final Tally
| Sprint | Features | Endpoints | UI |
|---|---|---|---|
| 1 | P1-D, P1-B, P1-C | 2 | 1 |
| 2 | P1-A, F6 | 1 + 1 hook | 1 |
| 3 | F1, F2 | 6 | 2 |
| 4 | F3, F4, F5 | 5 | 2 |
| 5 | Weekly Digest | 5 + 1 scheduler | 1 |
| 6 | Deeplinks | (extends dispatch + 1 prop) | (updates 2) |
| **Total** | **12 features** | **20 endpoints** | **7 components** |

### Sprints 1-4 — Phase 2 (Previously Completed)
- Sprint 1: P1-D Staleness + P1-B Filterable Tags + P1-C Scaling Panel (iteration_170.json)
- Sprint 2: P1-A Production Plan + Feature 6 Auto-Release (iteration_171.json)
- Sprint 3: Feature 1 Buffet Factors + Feature 2 Kitchen BEO (iteration_172.json)
- Sprint 4: Feature 3 Menu Engineering + Feature 4 Cost Variance + Feature 5 Plated→Catalog (iteration_173.json)

Previous milestones: Margin Policy Fase 3, Recipe Scaling MVP, Pydantic 422 Error Formatting, Bug fix 401, Cost Health Dashboard, save-scaled-menu fix.

### Calendar UX — Auto-Jump + TBD Bucket (Feb 15, 2026)
**Goal**: Resolve perceived "events not appearing" issue. After Culinary P2 testing (iteration_176), confirmed events DO appear correctly but UX caused confusion: calendar opened in current month which often had 0 events, while events with `event_date=NULL` (TBD) were silently hidden.

**Frontend**
- `CalendarPage.js` (`/calendar`): added `autoJumped` effect that, on first load, finds the nearest month (future preferred) containing an event and sets `currentDate` to it. Added "Events without date" amber card listing all TBD events with Set-date CTA linking to `/events/{id}`.
- `EngagementCalendar.js` (`/client-engagement/calendar`): mirror behavior — auto-jump on first load to closest event-bearing month, TBD bucket below the grid with click-to-open detail.

**Test results** (smoke screenshot): calendar now opens on June 2026 (nearest events) instead of empty May 2026; 6 TBD events listed below grid with "Set date" badge.

Phase 2 Culinary backend validated 19/19 in iteration_176.json.

### Pending Mini-tasks & Backlog
- Production SMTP credentials → enable real email delivery for digest.
- Logo Image Upload via Object Storage for Guest Flow (P1).
- Unified Contact Model (P1).
- Refactor `server.py` (~21k líneas) into routers (P2).
- Auto-repair legacy ingredients using AI (P2).

### Picklist ↔ Recipe Portion Format Linking + Bulk Generate (May 17, 2026)
**Goal**: Allow a single catalog (picklist) item to be linked to a specific portion format of a recipe (e.g. Gallon, 12oz, 8oz) instead of just the generic recipe. Item inherits format-specific cost and price. Also bulk-create one item per format with a single click.

**Backend** (`server.py`)
- `enrich_picklist_items` (GET `/api/settings/picklist`) now resolves `recipe_portion_format_id` against `recipe_portion_formats` and adds: `recipe_format_name`, `recipe_format_sell_price`, `recipe_format_suggested_price`, and uses `cost_per_portion` of the format when no manual `internal_cost` exists (cost_source=`recipe_format`).
- `PicklistItemUpdate` nullable_fields now includes `recipe_portion_format_id` so it can be cleared.
- **NEW** `POST /api/recipes/{recipe_id}/generate-picklist-items` — accepts `{format_ids[], category_id, name_prefix?, item_type?, skip_if_exists?}`, creates one picklist item per format (name = `{prefix} - {format_name}`), inherits `sell_price` → `default_price` and links `recipe_id` + `recipe_portion_format_id`. Idempotent via `skip_if_exists`.

**Frontend**
- `SettingsPage.js`: Item Add/Edit dialog now shows "Specific Format / Size" select when a recipe is linked. Auto-fills `default_price`. Picklist row shows a small badge with the format name.
- `RecipeBuilder.js`: New button "📦 Generar ítems de catálogo" (Generate catalog items) next to "Add Format" — only visible if recipe has at least 1 portion format. Opens a dialog with: name prefix, category select, checklist of formats with cost/price preview, idempotent submit.

**Tests**: Backend E2E (curl): single item link enriched correctly; bulk generate creates 3 items, re-run skips 3. Frontend smoke: Item dialog shows format dropdown with cost/price/Default labels.

Next: Configurar SMTP en producción, Logo Guest Flow, Unified Contact Model, UX Workstreams A/B/C de Culinary (surface daily insights, empty states, data capture wizard).
