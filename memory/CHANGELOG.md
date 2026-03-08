# Kora ERP - Changelog

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
