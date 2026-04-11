# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented (Latest Session - April 10-11, 2026)

### Sharing Fix (CRITICAL)
- **Frontend bug fixed**: `SocialMediaPage.js` dropdown only filtered `_access_type === "shared"` but cross-org accounts have `_access_type === "company_shared"`. Now includes both. (iteration_144+)
- **Backend unified**: `my-accounts` reads 4 sources: owned, account_memberships, social role memberships, company_sharing permissions.
- **ops role can share**: Relaxed permissions across all 3 sharing routers.
- **Verified end-to-end**: Pame (Margaret's assistant) now sees staffdo + cianogourmet in account selector dropdown.

### CRM & Dashboard
- Map: Leads (blue) vs Clients (green) with city detail dialog
- Follow-up completion dialog with notes + next scheduling
- Dynamic Lists for email segmentation
- Locale Settings: multi-currency, timezone
- i18n ES completions
- Interactive Leaflet Map
- Notifications, Sources, Dashboard, Pipeline, Tags, Service Areas

## Backlog
### P1
- Logo upload via Object Storage
- Unified Contact Model
- Unify Comms components
- Email sending integration (needs API key)
- Fix company-sharing/members KeyError

### P2
- Refactor SocialMediaPage.js (~3700 lines)
- Staffdo.com, Meta, TikTok APIs, UTM tracking

### P3
- WhatsApp Business API, additional languages

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Team: team.test@staffdo.com / Evoque2024!
- Margaret: margaret.n.calderon@gmail.com / Evoque2024!
- Pame: pamemey27@gmail.com / Evoque2024!

## User Language: Spanish (es)
