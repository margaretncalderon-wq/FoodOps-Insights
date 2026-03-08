# Kora ERP - Product Requirements Document

## Overview
Comprehensive ERP application for event management agencies with modules for People Ops, Finance, Culinary Intelligence, and Business Intelligence.

## Core Modules
- **System Pulse**: Dashboard with real-time system state
- **Client Engagement**: CRM and lead management
- **Program Orchestration**: Event planning and coordination
- **Execution Hub**: Operational goals and task tracking
- **Demand Generation**: Marketing campaigns and brand hub
- **Partners**: Vendor and partner management with capabilities
- **Business Clarity**: Financial reporting, invoices, ITBIS
- **People Ops**: HR, payroll, employee management
- **Culinary Intelligence**: Recipes, inventory, food costing
- **Settings**: System configuration

## Completed Features (March 2026)

### Payment Recording Flow (March 8, 2026)
- **Bug Fix**: Fixed critical bug preventing modal from advancing to Step 2 after client selection
- Multi-step payment workflow:
  - Step 1: Select client
  - Step 2: Select invoices/orders to apply payment
  - Step 3: Enter payment details (date, method, reference, notes)
- Automatic invoice balance update upon payment
- Payment receipt generation with company branding

### Data Migration Module
- CSV import for clients, suppliers, sales, inventory
- Robust header normalization (multiple formats supported)
- Special character handling with `re.escape()`
- Date format support: DD/MM/AAAA, YYYY-MM-DD
- Field mapping for legacy data compatibility

### Financial Features
- ITBIS tax reports (Formato 606 & 607) with Excel export
- Enhanced Purchase Order receiving flow
- Invoice and expense Excel exports with date filters

### Shared Suppliers Module
- Single `db.suppliers` collection
- Accessible from Partners and Culinary Intelligence
- Field parity between suppliers and partners
- "Preferred Supplier" system with visual indicators

### Editable Partner Capabilities
- User-configurable capabilities list in Settings
- Stored in `db.partner_capabilities` collection

### Inventory Import Enhancement (March 8, 2026)
- Fixed field mapping: `unit_cost`→`cost_per_unit`, `current_stock`→`stock_quantity`, `min_stock`→`min_stock_level`
- Brand field support
- Products now visible in Culinary Intelligence UI

## Database Schema

### Key Collections
- `suppliers`: Unified supplier data with `is_preferred` flag
- `partner_capabilities`: Custom capability definitions
- `ingredients`: Inventory items with `inventory_type`, `brand`
- `invoices`: Sales transactions
- `clients`: Customer data

## API Endpoints

### Data Migration
- `POST /api/migration/upload` - Upload CSV files
- `GET /api/migration/templates/{type}` - Download templates

### Inventory
- `GET /api/inventory` - Summary with field mapping
- `GET /api/inventory/ingredients` - List with filters
- `POST /api/inventory/ingredients` - Create item

### ITBIS
- `GET /api/itbis/format-606` - Generate 606 report
- `GET /api/itbis/format-607` - Generate 607 report
- `GET /api/itbis/export/{format}` - Export to Excel

## Credentials
- **Demo User**: demo.agency@kora.com / Evoque2024!

## Known Issues
- Intermittent session logout (not yet investigated)
- Emergent LLM Key budget exhausted

## Upcoming Tasks (Prioritized)
1. **P1**: Staffdo.com Integration - Job posting sync
2. **P2**: Meta/TikTok social media integration
3. **P2**: Email marketing provider (Mailchimp/Brevo)
4. **P3**: Complete i18n implementation
5. **P3**: Kora Comms (WhatsApp)
6. **P4**: Setup wizard for new users

## Architecture
```
/app/
├── backend/
│   ├── routers/
│   │   ├── migration.py      # Data import logic
│   │   ├── exports.py        # Excel exports
│   │   ├── itbis.py          # Tax reports
│   │   └── partners.py       # Partner/Supplier management
│   └── server.py             # Main API (inventory endpoints)
└── frontend/
    └── src/
        ├── components/Shared/Suppliers/  # Reusable supplier UI
        └── pages/
            ├── FoodOps/      # Culinary Intelligence
            ├── Partners/     # Partner management
            └── Settings/     # Configuration pages
```
