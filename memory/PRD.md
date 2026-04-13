# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented (Latest Session)

### Execution Hub Security Fix (CRITICAL)
- **Per-goal visibility**: private (owner + invited) / team (owner + assignees) / org (everyone in org). Default: org. (iteration_145)
- **Cross-org leak fixed**: Removed blanket membership access. Cross-org only via explicit sharing (shared_entities + execution_access).
- **UI**: Visibility selector in create dialog (3 options with icons + explanatory text). Badges on goal cards (Private=red lock, Team=blue users).

### Sharing Fixes
- Unified social account visibility (4 sources). (iteration_144)
- Frontend `company_shared` filter fix. (iteration_144+)
- ops role can share. (iteration_144)

### CRM & Dashboard
- Map: Leads vs Clients with city detail. Follow-up completion dialog. Dynamic Lists. Locale Settings. i18n. Interactive Leaflet Map. Notifications, Sources, Dashboard, Pipeline, Tags, Service Areas.

### Notification Bug
- Fixed invalid links causing logout on click. (iteration_145-)

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
