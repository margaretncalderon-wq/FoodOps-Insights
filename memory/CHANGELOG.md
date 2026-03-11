# Kora ERP - Changelog

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
