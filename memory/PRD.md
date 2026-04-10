# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## Core CRM Requirements (Current Focus)
- Intelligent lead conversion: 3 modes (Solo Cliente, Cliente+Evento Existente, Cliente+Evento Nuevo)
- Lead Sources catalog + CSV Import with dedup
- Combined "Lead" column (name+company+contact+type badge)
- Smart sort A-Z + Group by company/status/city
- Tags predefinidos en Settings (CRUD, 8 defaults, aplicables a leads)
- Áreas de servicio en Settings (países+regiones+ciudades, default RD)
- Mapa interactivo real (Leaflet/OpenStreetMap) de leads por ciudad en Dashboard CRM
- Filtro por ciudad en lista Outreach
- Kanban pipeline view
- Sales Reports + Weekly Goals
- CRM Dashboard con embudo de conversión y KPI métricas
- 7 Pipeline Stages: New → Contacted → Qualified → Proposal → Negotiation → Won → Lost
- In-app notifications al convertir lead a cliente (owner + managers)
- Fuentes de lead con asociación a eventos/activaciones

## What's Been Implemented

### Session: April 10, 2026 — Sprint 2
1. **Interactive Leaflet Map** — Replaced bubble visualization with real OpenStreetMap map with CircleMarkers. Moved from Outreach to Dashboard. Popups with lead counts. City legend bar. (iteration_140)
2. **In-app Notifications on Conversion** — Auto-notifications to owner + org admins/managers on lead conversion. (iteration_139)
3. **Lead Source with Event/Activation Linking** — Source dropdown (14 defaults incl. Activación, Outreach) with conditional event/activation picker. (iteration_139)
4. **CRM Dashboard** — KPI cards, Conversion Funnel (7 stages), Top Sources, Period filter. (iteration_138)
5. **Pipeline Stage Alignment** — Backend accepts all 9 statuses. Outreach/Inbound sections synced. (iteration_138)
6. **Inbound Status Expansion** — 9 status filter options with full color palette + Spanish labels. (iteration_138)

### Session: April 10, 2026 — Sprint 1
1. CRM Tags — CRUD en Settings, 8 defaults (iteration_137)
2. Service Areas — CRUD en Settings, default RD
3. Lead Map — Original bubble map (now replaced with Leaflet)
4. City Filter — Filtro activo desde mapa o group-by
5. Source Normalization — Backend cleanup

### Session: April 9, 2026
1. CRM Lead Conversion — 3 modes (iteration_135)
2. Lead Sources Catalog — CRUD + 14 defaults
3. CSV Import Overhaul (iteration_136)
4. CRM List View Overhaul
5. Move to Outreach button in Inbound

### Previous Sessions
- Demand Studio, People Ops, Guest Flow, Business Clarity, Settings

## Architecture
- Leads and Clients remain separate entities
- Tags, Service Areas, Lead Sources = Settings-managed catalogs
- Geo-stats aggregated from lead city field
- Outreach and Inbound are separate sections (user explicit choice)
- Notifications use existing in-app system (NotificationBell + notifications router)
- Interactive map uses react-leaflet v5 + CartoDB light tiles (no API key needed)

## Backlog

### P1 — Sprint 3: Unified Contact & Comms
- Logo upload vía Object Storage para Guest Flow
- Unified Contact Model (Merge Lead+Client lifecycle)
- Unify 5 Comms components into 1-2

### P1 — Technical Debt
- Refactor SocialMediaPage.js (~3700 lines)
- Extract import/export from server.py

### P2 — Sprint 4: Email Marketing
- Listas dinámicas (segmentación por ciudad+tags+status)
- Integración email real (Brevo/Resend)
- Templates y campañas

### P2 — Integrations
- Staffdo.com, Meta, TikTok APIs
- UTM tracking completo

### P3 — International Scale
- Multi-moneda, Timezone, i18n, WhatsApp Business API

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!

## Key Files
- `backend/routers/crm.py` — All CRM endpoints
- `backend/routers/notifications.py` — In-app notification system
- `frontend/src/components/crm/CrmDashboard.js` — Dashboard with funnel, KPIs & map
- `frontend/src/components/crm/LeadMapInteractive.js` — Leaflet interactive map
- `frontend/src/components/crm/LeadOutreachSection.js` — Outreach list (map removed)
- `frontend/src/components/crm/LeadInboundSection.js` — Inbound list
- `frontend/src/components/notifications/NotificationBell.js` — Bell icon
- `frontend/src/pages/CRMPageNew.js` — CRM page routes
- `backend/models/crm.py` — LeadCreate model

## User Language: Spanish (es)
