# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented (Latest Session)

### Companies Bug Fix (CRITICAL - Client-facing)
- **Root cause**: `company_entities` collection had 3 inconsistent ID formats: `company_entity_id` (API), `entity_id` (CSV import), `id` (old migration). The `list_companies` endpoint crashed with `KeyError: 'company_entity_id'`, showing empty page.
- **Fix**: Startup migration normalizes all records. Endpoints handle all formats. CSV import corrected. `company_sharing/members` KeyError also fixed. (iteration_146)

### Execution Hub Security Fix
- Per-goal visibility (private/team/org). Cross-org leak removed. (iteration_145)

### Sharing Unification
- Social account org-level visibility. Frontend company_shared filter fix. ops role can share. (iteration_144)

### CRM & Dashboard
- Map: Leads vs Clients. Follow-ups. Dynamic Lists. Locale. i18n. Leaflet Map. Notifications. Dashboard. Pipeline. Tags.

## Backlog
### P1
- Logo upload via Object Storage
- Unified Contact Model
- Unify Comms components
- Email sending integration (needs API key)

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
