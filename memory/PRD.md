# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented (Latest Session - April 10, 2026)

### Sharing Unification
- **Unified social account visibility** — `my-accounts` endpoint now reads 4 sources: owned, account_memberships, social role memberships (social_viewer/contributor/editor), and company_sharing permissions. (iteration_144)
- **ops role can share** — Previously only owner/admin/manager. Now ops can share accounts, invite collaborators, and share company. (iteration_144)

### CRM & Dashboard
- Map: Leads (blue) vs Clients (green) with city detail dialog (iteration_142)
- Follow-up completion dialog with notes + next scheduling (iteration_142)
- Dynamic Lists for email segmentation (iteration_141)
- Locale Settings: multi-currency, timezone (iteration_141)
- i18n ES completions (iteration_141)
- Interactive Leaflet Map (iteration_140)
- Notifications, Sources, Dashboard, Pipeline (iterations 138-139)
- Tags, Service Areas, Map, City Filter (Sprint 1)
- Lead Conversion, Sources, CSV Import (April 9)

## Backlog
### P1
- Logo upload via Object Storage
- Unified Contact Model (merge Lead+Client)
- Unify Comms components (5 → 1-2)
- Email sending integration (Resend/Brevo — needs API key)
- Fix company-sharing/members KeyError bug

### P2
- Refactor SocialMediaPage.js (~3700 lines)
- Staffdo.com, Meta, TikTok APIs
- UTM tracking

### P3
- WhatsApp Business API, additional languages

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!

## User Language: Spanish (es)
