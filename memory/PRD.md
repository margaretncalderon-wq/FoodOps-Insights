# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## Core CRM Requirements (Current Focus)
- Intelligent lead conversion: 3 modes (Solo Cliente, Cliente+Evento Existente, Cliente+Evento Nuevo)
- Lead Sources catalog + CSV Import with dedup
- Combined "Lead" column (name+company+contact+type badge)
- Smart sort A-Z + Group by company/status/city
- **Tags predefinidos** en Settings (CRUD, 8 defaults, aplicables a leads)
- **Áreas de servicio** en Settings (países+regiones+ciudades, default RD)
- **Mapa interactivo** de leads por ciudad (burbujas, hover, click=filtra)
- **Filtro por ciudad** en lista Outreach
- Kanban pipeline view
- Sales Reports + Weekly Goals
- **CRM Dashboard** con embudo de conversión y KPI métricas
- **7 Pipeline Stages**: New → Contacted → Qualified → Proposal → Negotiation → Won → Lost

## What's Been Implemented

### Session: April 10, 2026 — Sprint 2
1. **CRM Dashboard** — KPI cards (Total Leads, Contacted, Hot Leads, Won/Win Rate), Conversion Funnel (7 stages), Top Sources, Period filter (All/7d/30d/90d). Integrated into CRM sidebar and Client Engagement dropdown. (iteration_138)
2. **Pipeline Stage Alignment** — Backend accepts all 9 statuses (7 pipeline + NoResponse + Engaged). Outreach and Inbound sections synced with backend stages.
3. **Inbound Status Expansion** — STATUS_FILTERS updated from 3 (New/Contacted/Converted) to 9 (All + 7 pipeline + Converted). Status badges now include full color palette and Spanish labels.
4. **Dashboard as Default CRM Route** — `/crm` now redirects to `/crm/dashboard` instead of `/crm/outreach`.

### Session: April 10, 2026 — Sprint 1
1. **CRM Tags** — CRUD en Settings, 8 defaults (VIP, Hot Lead, Referido, etc.), asignables a leads, visibles en tabla (iteration_137)
2. **Service Areas** — CRUD en Settings, default RD con 7 regiones y ciudades principales, expandible
3. **Lead Map** — Mapa de burbujas por ciudad, hover=tooltip detallado, click=filtra lista, barra de desglose con %
4. **City Filter** — Filtro activo desde mapa o group-by en Outreach
5. **Source Normalization** — Backend cleanup + endpoint

### Session: April 9, 2026
1. CRM Intelligent Lead Conversion — 3 modes (iteration_135)
2. Lead Sources Catalog — CRUD + 12 defaults
3. CSV Import Overhaul — Default outreach, company dedup, source param
4. CRM List View Overhaul — Combined Lead column, sort, grouping (iteration_136)
5. Move to Outreach button in Inbound

### Previous Sessions
- Demand Studio, People Ops, Guest Flow, Business Clarity, Settings

## Architecture
- Leads and Clients remain **separate entities** (clients used for proposals)
- Tags, Service Areas, Lead Sources = Settings-managed catalogs
- Geo-stats aggregated from lead city field
- Outreach and Inbound are **separate sections** (user explicit choice)

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
- `backend/routers/crm.py` — All CRM endpoints (tags, areas, geo-stats, leads, sources, pipeline stages)
- `frontend/src/components/crm/CrmDashboard.js` — Dashboard with funnel & KPIs
- `frontend/src/components/settings/CrmConfigSection.js` — Tags + Service Areas UI
- `frontend/src/components/crm/LeadMapSection.js` — Interactive lead map
- `frontend/src/components/crm/LeadOutreachSection.js` — Outreach list with map+tags
- `frontend/src/components/crm/LeadInboundSection.js` — Inbound list with full pipeline statuses
- `frontend/src/pages/CRMPageNew.js` — CRM page with sidebar nav and routes
- `frontend/src/pages/ClientEngagementPage.js` — Client Engagement page with CRM dropdown

## User Language: Spanish (es)
