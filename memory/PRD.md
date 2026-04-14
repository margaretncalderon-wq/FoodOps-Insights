# Kora OS - Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called Kora OS with modules for People Ops, Business Clarity, Recruitment, Settings, Super Admin, Demand Studio, CRM/Client Engagement, Partners.

## What's Been Implemented (Latest Session)

### Demand Studio — Story Series & Calendar Colors
- **Story Series (Batch creation)**: Button "Serie de Stories" creates N stories at once with shared series_id. Preview, template save/load, campaign linking. (iteration_147)
- **Format Color-Coding**: Calendar shows posts with format-based colors (Post=green, Reel=purple, Story=yellow, Carousel=blue, Live=red). Configurable in Settings > Colors tab. (iteration_147)
- **Account Colors**: Each social account gets a custom color, shown as left border in calendar posts. Configurable in Settings > Colors tab. (iteration_147)
- **Story Templates**: Save series configs as reusable templates. Apply to quickly create common story sequences. (iteration_147)

### Companies Bug Fix
- Fixed KeyError on list_companies (3 inconsistent ID formats). Startup migration auto-fixes. (iteration_146)

### Execution Hub Security
- Per-goal visibility (private/team/org). Cross-org leak removed. (iteration_145)

### Sharing Unification
- Social account org-level visibility. Frontend company_shared filter. ops role. (iteration_144)

### CRM & Dashboard
- Map, Follow-ups, Dynamic Lists, Locale, i18n, Leaflet, Notifications, Dashboard, Pipeline, Tags.

## Backlog
### P1
- Logo upload via Object Storage
- Unified Contact Model
- Unify Comms components
- Email sending integration (needs API key)

### P2
- Refactor SocialMediaPage.js (~3900 lines)
- Staffdo.com, Meta, TikTok APIs, UTM tracking

### P3
- WhatsApp Business API, additional languages

## Test Credentials
- Admin: demo.agency@kora.com / Evoque2024!
- Margaret: margaret.n.calderon@gmail.com / Evoque2024!
- Pame: pamemey27@gmail.com / Evoque2024!

## User Language: Spanish (es)
