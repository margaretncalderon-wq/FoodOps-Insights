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
- Mapa interactivo de leads por ciudad (burbujas, hover, click=filtra)
- Filtro por ciudad en lista Outreach
- Kanban pipeline view
- Sales Reports + Weekly Goals
- CRM Dashboard con embudo de conversión y KPI métricas
- 7 Pipeline Stages: New → Contacted → Qualified → Proposal → Negotiation → Won → Lost
- In-app notifications al convertir lead a cliente (owner + managers)
- Fuentes de lead con asociación a eventos/activaciones

## What's Been Implemented

### Session: April 10, 2026 — Sprint 2 (continued)
1. **In-app Notifications on Conversion** — When a lead is converted to client, automatic notifications are sent to the lead owner and all org admins/managers. Uses existing NotificationBell. (iteration_139)
2. **Lead Source with Event/Activation Linking** — Outreach creation form now has a Source dropdown (14 default sources including Activación, Outreach). When "Evento" is selected, a secondary dropdown appears to pick the specific event. When "Activación" is selected, activation picker appears. Source fields saved to lead record. (iteration_139)
3. **CRM Dashboard** — KPI cards (Total Leads, Contacted, Hot Leads, Won/Win Rate), Conversion Funnel (7 stages), Top Sources, Period filter. Integrated into CRM sidebar and Client Engagement dropdown. (iteration_138)
4. **Pipeline Stage Alignment** — Backend accepts all 9 statuses (7 pipeline + NoResponse + Engaged). Outreach and Inbound sections synced. (iteration_138)
5. **Inbound Status Expansion** — STATUS_FILTERS expanded to 9 options. Status badges with full color palette and Spanish labels. (iteration_138)

### Session: April 10, 2026 — Sprint 1
1. CRM Tags — CRUD en Settings, 8 defaults, asignables a leads (iteration_137)
2. Service Areas — CRUD en Settings, default RD con 7 regiones y ciudades
3. Lead Map — Mapa de burbujas por ciudad, hover, click=filtra
4. City Filter — Filtro activo desde mapa o group-by en Outreach
5. Source Normalization — Backend cleanup + endpoint

### Session: April 9, 2026
1. CRM Intelligent Lead Conversion — 3 modes (iteration_135)
2. Lead Sources Catalog — CRUD + 12 defaults (now 14)
3. CSV Import Overhaul — Default outreach, company dedup, source param
4. CRM List View Overhaul — Combined Lead column, sort, grouping (iteration_136)
5. Move to Outreach button in Inbound

### Previous Sessions
- Demand Studio, People Ops, Guest Flow, Business Clarity, Settings

## Architecture
- Leads and Clients remain separate entities (clients used for proposals)
- Tags, Service Areas, Lead Sources = Settings-managed catalogs
- Geo-stats aggregated from lead city field
- Outreach and Inbound are separate sections (user explicit choice)
- Notifications use existing in-app notification system (NotificationBell + notifications router)

## Backlog

### P1 — Sprint 3: Unified Contact & Comms
- Logo upload vía Object Storage para Guest Flow
- Unified Contact Model (Merge Lead+Client lifecycle to prevent duplication on conversion)
- Unify 5 Comms components into 1-2

### P1 — Technical Debt
- Refactor SocialMediaPage.js (~3700 lines)
- Extract import/export from server.py
- Fix React key warning (duplicate 'Santo Domingo' in LeadMapSection)

### P2 — Sprint 4: Email Marketing
- Listas dinámicas (segmentación por ciudad+tags+status)
- Integración email real (Brevo/Resend)
- Templates y campañas

### P2 — Integrations
- Staffdo.com, Meta, TikTok APIs
- UTM tracking completo

### P3 — International Scale
- Multi-moneda (USD, DOP, EUR, MXN)
- Timezone-aware
- i18n completo
- Geo-detection automática
- WhatsApp Business API

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!

## Key Files
- `backend/routers/crm.py` — All CRM endpoints (tags, areas, geo-stats, leads, sources, pipeline stages, conversion)
- `backend/routers/notifications.py` — In-app notification system (create_notification, notify_org_admins)
- `frontend/src/components/crm/CrmDashboard.js` — Dashboard with funnel & KPIs
- `frontend/src/components/crm/LeadOutreachSection.js` — Outreach list with map+tags+source selector
- `frontend/src/components/crm/LeadInboundSection.js` — Inbound list with full pipeline statuses
- `frontend/src/components/notifications/NotificationBell.js` — Bell icon with unread count
- `frontend/src/pages/CRMPageNew.js` — CRM page with sidebar nav and routes
- `frontend/src/pages/ClientEngagementPage.js` — Client Engagement page with CRM dropdown
- `backend/models/crm.py` — LeadCreate model with source_event_id, activation_id

## User Language: Spanish (es)
