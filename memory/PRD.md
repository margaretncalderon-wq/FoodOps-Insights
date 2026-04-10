# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented

### Session: April 10, 2026 — Latest
1. **Social Account Org-Level Visibility** — Fixed account sharing so team members can see accounts shared with any member of their org + accounts from companies shared via company_sharing with social_media permission. (iteration_143)
2. **Map: Leads vs Clients** — Blue/green markers, click for city detail list. (iteration_142)
3. **Follow-up Completion Dialog** — Notes + next follow-up scheduling. (iteration_142)
4. **CRM Dynamic Lists** — Segmentation for email marketing. (iteration_141)
5. **Locale Settings** — Multi-currency, timezone, language. (iteration_141)
6. **i18n Completions** — ES translations. (iteration_141)
7. **Interactive Leaflet Map** — OpenStreetMap in Dashboard. (iteration_140)
8. **Notifications, Sources, Dashboard, Pipeline** — (iterations 138-139)

## Backlog

### P1
- Logo upload via Object Storage
- Unified Contact Model
- Unify Comms components
- Email sending integration (needs API key)

### P1 — Technical Debt
- Refactor SocialMediaPage.js (~3700 lines)
- Extract import/export from server.py
- Fix company-sharing/members KeyError bug

### P2
- Staffdo.com, Meta, TikTok APIs, UTM tracking

### P3
- WhatsApp Business API, additional languages

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!

## User Language: Spanish (es)
