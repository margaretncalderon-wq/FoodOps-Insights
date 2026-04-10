# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented

### Session: April 10, 2026 — Sprint 4 (Email Marketing + i18n + Multi-currency)
1. **CRM Dynamic Lists** — Segmentation engine: filter leads by status, city, source, tags, lead type, has_email. CRUD endpoints + preview. Integrated into Email Marketing page as "Listas" tab. (iteration_141)
2. **Locale Settings (Multi-currency + Timezone)** — New "Regional" section in Settings > Company. Supports 11 currencies (DOP, USD, EUR, MXN, COP, PEN, ARS, CLP, BRL, GBP, CAD) and 19 timezones. LocaleContext provides `formatCurrency`, `formatDate`, `formatDateTime` utilities. (iteration_141)
3. **i18n Completions** — Fixed all missing Spanish translations in LanguageContext: Locations/Venues section (50+ keys), Documents section (contract, invoice, notSigned), common keys (duplicate, booking). (iteration_141)

### Session: April 10, 2026 — Sprint 2
1. **Interactive Leaflet Map** — Real OpenStreetMap in Dashboard with CircleMarkers. (iteration_140)
2. **In-app Notifications on Conversion** — Auto-notify owner + admins/managers. (iteration_139)
3. **Lead Source + Event/Activation Linking** — 14 default sources with conditional event/activation picker. (iteration_139)
4. **CRM Dashboard** — KPIs, Funnel, Top Sources, Period filter. (iteration_138)
5. **Pipeline Stage Alignment** — 7 stages synced backend/frontend. (iteration_138)
6. **Inbound Status Expansion** — Full pipeline statuses. (iteration_138)

### Session: April 10, 2026 — Sprint 1
1. CRM Tags — CRUD, 8 defaults. (iteration_137)
2. Service Areas — CRUD, default RD.
3. Lead Map — Original bubbles (replaced with Leaflet).
4. City Filter, Source Normalization.

### Session: April 9, 2026
1. Lead Conversion — 3 modes. (iteration_135)
2. Lead Sources — CRUD + 14 defaults. (iteration_136)
3. CSV Import, List View Overhaul, Move to Outreach.

### Previous Sessions
- Demand Studio, People Ops, Guest Flow, Business Clarity, Settings

## Architecture
- Leads and Clients = separate entities
- Outreach and Inbound = separate sections
- Tags, Service Areas, Lead Sources, Dynamic Lists = Settings-managed catalogs
- Notifications = existing in-app system
- Map = react-leaflet v5 + CartoDB tiles
- Locale = LocaleContext (formatCurrency, formatDate, formatDateTime)
- i18n = LanguageContext (EN/ES) + inline isEs pattern

## Backlog

### P1 — Sprint 3: Unified Contact & Comms
- Logo upload via Object Storage
- Unified Contact Model (merge Lead+Client lifecycle)
- Unify 5 Comms components into 1-2

### P1 — Email Marketing (needs API key)
- Actual email sending integration (Resend or Brevo) — awaiting user API key
- Campaign send flow with scheduling
- Open/click tracking from real sends

### P1 — Technical Debt
- Refactor SocialMediaPage.js (~3700 lines)
- Extract import/export from server.py
- Fix duplicate 'Santo Domingo' key in geo-stats

### P2 — Integrations
- Staffdo.com, Meta, TikTok APIs
- UTM tracking completo

### P3 — International Scale
- WhatsApp Business API
- Additional languages (FR, PT)
- Geo-detection automatica

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!

## Key Files
- `backend/routers/crm.py` — All CRM endpoints incl. dynamic lists
- `backend/routers/organization_config.py` — Org config + locale settings
- `backend/routers/notifications.py` — In-app notifications
- `frontend/src/contexts/LocaleContext.js` — Multi-currency/timezone/locale
- `frontend/src/contexts/LanguageContext.js` — i18n translations (EN/ES)
- `frontend/src/components/crm/CrmDashboard.js` — Dashboard + map
- `frontend/src/components/crm/LeadMapInteractive.js` — Leaflet map
- `frontend/src/components/crm/DynamicListsSection.js` — Segmentation lists
- `frontend/src/components/settings/LocaleSettingsSection.js` — Locale UI
- `frontend/src/pages/demand-studio/EmailMarketingPage.js` — Email + Lists

## User Language: Spanish (es)
