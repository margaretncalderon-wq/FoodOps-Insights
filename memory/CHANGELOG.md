# Kora ERP - Changelog

## [2026-03-12] - Fix: Shared Org Users Now Visible in Demand Studio

### Fixed
- **Users with full org access not showing in Demand Studio Settings** - The collaborators endpoint (`/api/social-sharing/collaborators`) only queried memberships with specific social roles (`social_viewer`, `social_contributor`). Users with org-level roles like `ops`, `editor`, `hr`, `finance` or custom roles were excluded.
  - Now fetches ALL active memberships (any role, status != removed) PLUS team members from the same company
  - Improved name resolution: checks `name` → `first_name + last_name` → email fallback
  - Added `source` field ("shared" or "team") to differentiate membership types

### Removed
- **"Partners Externos" section** removed from Demand Studio Settings (was incorrectly placed there)

---

## [2026-03-12] - External Partners visible in Demand Studio Settings

### Added
- **External Partners section in Demand Studio Settings** - Shows agencies, contractors, freelancers and associations from the Partners module directly in the Social Media Settings tab.
- Partners displayed with name, type badge, status badge, and link to their detail page.
- Filtered to only show relevant partner types (agency, contractor, freelancer, asociacion).

---

## [2026-03-12] - Segments: Pillar Association

### Added
- **Pillar selector in Segment form** - New multi-select in the Segment dialog to choose which pillars feed each segment
- **Pillar badges in segment list** - Settings shows blue badges with pillar names for each segment
- Backend: Added `pillar_ids: List[str]` to `SegmentCreate` and `Segment` models, and to create/update handlers

---

## [2026-03-12] - Fix: Ideas Tab Empty + Queue Showing Ideas

### Fixed
- **Ideas tab was empty** - Posts with status "idea" were stored in `social_posts` collection but Ideas tab only read from `content_ideas`. Now combines both sources using `allIdeas` computed array.
- **Queue showed "idea" status items** - Added filter to exclude `status === "idea"` from `filteredPosts` in the Queue tab.
- **Proper action handlers** - Ideas from posts (`_from_post`) use post edit/delete handlers, while native ideas use idea handlers.

---

## [2026-03-12] - Fix: Shared Users Can Now See Comments

### Fixed
- **Collaborators couldn't see comments on shared entities** - The comments endpoints used `user.company_id` (the collaborator's own company) instead of the shared org's company_id.
  - Backend: Added `org_id` query parameter to GET and POST comments endpoints in `comments.py`
  - Backend: Changed company_id resolution priority to: `org_id param → active_org_id → company_id`
  - Frontend: `CommentsSection.js` now passes `orgId` in fetch and create API calls
  - Added membership verification for cross-org access

---

## [2026-03-12] - Demand Studio: Eye Button + Notification Clicks

### Added
- **Eye (view) button in Queue actions** - New blue Eye icon as first action button in the Queue tab. Opens the post dialog for viewing.
- **Reordered action buttons**: Eye → Copy → Delete → Check (listo last, to avoid accidental status changes)

### Fixed
- **Mention notifications now clickable** - Notifications from @mentions now have a `link` field that navigates to the correct page:
  - `social_post/idea/note` → `/demand-studio`
  - `partner` → `/partners/{entity_id}`
- **Notification field alignment** - Fixed mention notifications to use `read` (not `is_read`) and `notification_type` (not `type`), aligning with the notification system schema.
- Files: `SocialMediaPage.js`, `comments.py`, `NotificationBell.js`

---

## [2026-03-11] - Fix: CRM Owner Name Resolution (Deep Fix)

### Fixed
- **CRM owner name now uses first_name/last_name as fallback** - When a user's `name` field is empty, the system now checks `first_name + last_name` before falling back to email-derived name.
  - Fixed in 4 backend locations:
    - `enrich_leads_with_owner_names` (crm.py) - enriches outreach/inbound leads
    - `/api/crm/team-members` endpoint - dropdown population
    - `/api/crm/follow-ups` endpoint - follow-up owner names
    - Lead-to-client conversion - owner name on new clients
    - Sales report owner stats
  - Fixed in 2 frontend locations:
    - `LeadOutreachSection.js` - fetchUsers name resolution
    - `LeadInboundSection.js` - fetchUsers name resolution
  - Name resolution order: `name` → `first_name + last_name` → email fallback

---

## [2026-03-11] - Partner Notes (Comments) Feature

### Added
- **Notas/Comments tab in Partner Detail Page** - New "Notes" tab in the partner detail page using the reusable `CommentsSection` component.
  - Supports creating, editing, and deleting notes/comments
  - @mentions with user autocomplete
  - Threaded replies
  - Emoji reactions
  - File: `/app/frontend/src/pages/Partners/PartnerDetailPage.js`

---

## [2026-03-11] - P0 Bug Fixes: CRM Owner Display & Inactive Users

### Fixed
- **CRM Owner Assignment: Name Display** - Owner column in the assignment table was showing a truncated `owner_id` (e.g., `user_35d337`) instead of the user's full name. Now displays `owner_name` from enriched lead data, falls back to name lookup from team members array.
  - File: `/app/frontend/src/components/crm/OwnerAssignmentSection.js` (Line ~319)

- **Deleted/Inactive Users in Selection Lists** - Users marked as inactive (`is_active: false`) were still appearing in dropdowns for mentions, assignments, and collaborators across CRM and Demand Studio.
  - Added `"is_active": {"$ne": False}` filter to:
    - `/api/comments/mentions/users` (comments.py Line 46) - Main company users query
    - `/api/comments/mentions/users` (comments.py Line 85) - Membership users query
    - `/api/demand-studio/marketing-partners` (demand_studio.py Line 2343)
  - `/api/crm/team-members` already had the filter (crm.py Line 1734) - verified.

### Testing
- Backend: 10/10 tests passed (test_crm_owner_display_bugfix.py)
- Frontend: UI verification passed - Owner Assignment shows full names, dropdowns populated correctly

---


# Kora ERP - Changelog

## [2026-03-08] - Payment Recording Flow Fix

### Fixed
- **Payment Modal Step Transition Bug**: Fixed critical bug where selecting a client in the "Record Payment" modal would not advance to Step 2
  - Root cause: `handleClientChange` was calling `setStep(2)` before `fetchClientItems` (async) completed
  - Solution: Made `handleClientChange` async and await the fetch before advancing step
  - File: `/app/frontend/src/components/business-clarity/PaymentsSection.js`

### Verified Working
- Complete payment recording flow:
  1. Step 1: Client selection → ✅
  2. Step 2: Invoice/Order selection with amounts → ✅
  3. Step 3: Payment details (date, method, reference, notes) → ✅
  4. Create payment & receipt → ✅
  5. Invoice balance update → ✅
  6. Payment list with correct "applied" status → ✅

---

## [2026-03-08] - Cierres Retroactivos

### Added
- **Period Close Available Periods Endpoint**: `GET /api/business-clarity/period-close/available-periods`
  - Lists all periods with imported data (sales, invoices, expenses)
  - Shows status: closed, current, pending
  - Indicates if period can be closed (chronological order enforced)
  
- **Retroactive Period Closing**: Modified `POST /api/business-clarity/period-close/{year}/{month}/close`
  - Supports closing past periods
  - Manual Opening Inventory override for first period
  - Validates chronological order (must close previous period first)
  - Creates `opening_balance` stock movement when manual value provided

- **Frontend Periods Panel**: `CloseReconciliationSection.js`
  - "View Periods" button with badge showing pending periods count
  - Visual panel displaying all periods with sales/invoice/expense totals
  - Click to select period, direct close button for eligible periods
  - Editable Opening Inventory field when no previous period exists

### Fixed
- **Inventory Field Mapping**: Added legacy field mapping in inventory endpoints
  - `unit_cost` → `cost_per_unit`
  - `current_stock` → `stock_quantity`
  - `min_stock` → `min_stock_level`

### Database
- Created `opening_balance` stock movement for January 2026 ($16,228)
- Updated 867 ingredients with correct field names

---

## [2026-03-07] - Data Migration & Export Features

### Added
- Excel export for tax formats 606 & 607
- Data migration CSV import for clients, suppliers, sales, inventory
- Shared Suppliers module (Partners + Culinary Intelligence)
- Editable Partner Capabilities in Settings
- Preferred Supplier system with visual indicators

### Fixed
- Multiple data migration bugs (headers, special characters, date formats)
- Inventory import template download
- Partner form "Sistema" tab crash
