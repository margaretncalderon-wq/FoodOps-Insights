# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented

### Session: April 10, 2026 — Latest
1. **Map: Leads vs Clients** — Blue markers = leads, green markers = clients. Click city → dialog with full lead+client list. Backend geo-stats now aggregates both collections. New city-detail endpoint. (iteration_142)
2. **Follow-up Completion Dialog** — "Completar" now opens dialog with notes textarea + optional next follow-up scheduling. Notes saved as comm_log entry. (iteration_142)
3. **CRM Dynamic Lists** — Segmentation by status/city/source/tags/type/email. Integrated in Email Marketing. (iteration_141)
4. **Locale Settings** — Multi-currency (11), timezone (19), language. LocaleContext utilities. (iteration_141)
5. **i18n Completions** — 50+ missing ES translations. (iteration_141)
6. **Interactive Leaflet Map** — Real OpenStreetMap in Dashboard. (iteration_140)
7. **In-app Notifications** — Conversion alerts for owner + managers. (iteration_139)
8. **Lead Source + Event/Activation** — 14 sources with pickers. (iteration_139)
9. **CRM Dashboard** — KPIs, Funnel, Top Sources. (iteration_138)
10. **Pipeline Stages** — 7 stages aligned backend/frontend. (iteration_138)

### Previous Sessions
- Sprint 1: Tags, Service Areas, Map, City Filter
- April 9: Lead Conversion, Sources, CSV Import, List View
- Earlier: Demand Studio, People Ops, Guest Flow, Business Clarity, Settings

## Backlog

### P1
- Logo upload via Object Storage
- Unified Contact Model (merge Lead+Client lifecycle)
- Unify 5 Comms components into 1-2
- Email sending integration (Resend/Brevo) — needs API key

### P1 — Technical Debt
- Refactor SocialMediaPage.js (~3700 lines)
- Extract import/export from server.py

### P2
- Staffdo.com, Meta, TikTok APIs
- UTM tracking

### P3
- WhatsApp Business API
- Additional languages (FR, PT)

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!

## Key Files
- `backend/routers/crm.py` — CRM endpoints (geo-stats, follow-ups, dynamic lists, pipeline)
- `frontend/src/components/crm/LeadMapInteractive.js` — Leaflet map with leads (blue) + clients (green)
- `frontend/src/components/crm/FollowUpsSection.js` — Follow-ups with completion dialog
- `frontend/src/components/crm/CrmDashboard.js` — Dashboard + map
- `frontend/src/components/crm/DynamicListsSection.js` — Segmentation lists
- `frontend/src/contexts/LocaleContext.js` — Multi-currency/timezone
- `frontend/src/contexts/LanguageContext.js` — i18n EN/ES

## User Language: Spanish (es)
