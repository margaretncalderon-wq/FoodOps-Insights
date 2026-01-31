# EEP Evoque Events Platform - PRD

## Overview
Cloud-based, modular web platform for event management with CRM, Event Management, Recipe Costing, Quoting System, and full Proposal/Contract workflow.

## Core Modules

### 1. Authentication
- JWT-based email/password authentication (WORKING)
- Google OAuth via Emergent-managed auth (BROKEN - Invalid state parameter)

### 2. CRM Module (Refactored)
- **Leads**: Inbound inquiries from embeddable forms, separate from clients
- **Clients**: Qualified clients with display_name, client_type (Company/Individual)
- **Contacts**: Associated contacts per client
- **Events Pipeline**: Sales funnel with stages (Lead, Contacted, Proposal, Won)
- **Lead Form Builder**: Configurable public forms with multilingual support (EN/ES)

### 3. Events Module
- Event creation with client linking
- Multi-day support, TBD dates
- Venue, guest count, budget tracking
- **NEW: Operational Status** (Open, In Production, Completed, Closed)
- **NEW: Financial Status** (Draft, In Review, Approved)

### 4. Proposal/Contract System (NEW - Jan 31, 2026)
Each Event has ONE active Proposal that serves as:
- Commercial proposal
- Client-facing contract  
- Pricing authority (single source of truth)

**Proposal Fields:**
- proposal_number (auto-generated: PROP-YYYY-####)
- status (Draft, Sent, Accepted, Rejected)
- valid_until, client_notes, payment_terms
- subtotal, discount_amount, tax_details, total
- total_cost, total_margin, margin_percentage (internal)

### 5. Order Items (NEW - Jan 31, 2026)
Unified commercial engine for all items sold in an event:

**Item Types:**
- Food (links to recipes for auto cost calculation)
- Service (manual internal_cost)
- Rental (manual internal_cost)
- Fee (manual internal_cost)

**Item Fields:**
- description (client-facing)
- quantity, unit_price (visible to client)
- internal_cost (hidden, internal only)
- total_price, total_cost, margin_amount, margin_percentage (calculated)

### 6. Margin Tracking (NEW - Jan 31, 2026)
Internal-only financials visible to Admin/Owner:
- Total revenue
- Total internal cost
- Gross margin (amount and percentage)
- Breakdown by item_type
- Warnings for missing costs and low margins

### 7. Feature Flags (NEW - Jan 31, 2026)
Configurable in Settings > Features:
- is_proposal_editing_enabled
- is_order_items_enabled
- is_margin_tracking_enabled
- is_document_autogeneration_enabled
- is_custom_fields_enabled
- is_food_ops_enabled

All flags ON by default.

### 8. Document Templates (NEW - Jan 31, 2026)
Auto-generated from Event Order:
- Proposal / Contract (PDF)
- Invoice
- Packing List
- Kitchen Sheet
- Service / Setup Sheet

### 9. Audit Log (NEW - Jan 31, 2026)
Tracks changes after Proposal.status = Accepted:
- User, timestamp
- Action type (add/remove/edit item, status change)
- Impact on totals

### 10. Recipe Costing
- Ingredient management
- Recipe creation with yield and portions
- Auto cost calculation per serving

### 11. Inventory
- Stock tracking
- Supplier management

## Tech Stack
- **Frontend**: React, Shadcn/UI, Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT + Emergent Google OAuth

## API Routes

### Settings
- GET/PUT `/api/settings/feature-flags`
- GET/POST/PUT/DELETE `/api/settings/document-templates`
- GET/POST/PUT/DELETE `/api/settings/categories`
- GET/POST/PUT/DELETE `/api/settings/taxes`

### Proposals
- GET `/api/proposals/event/{event_id}` - Get or create proposal
- PUT `/api/proposals/{proposal_id}` - Update proposal
- PUT `/api/proposals/{proposal_id}/financials` - Update financials
- PUT `/api/proposals/{proposal_id}/custom-fields` - Update custom fields
- GET/POST `/api/proposals/{proposal_id}/items` - Order items
- PUT/DELETE `/api/proposals/{proposal_id}/items/{item_id}` - Item CRUD

### Events
- GET `/api/events/{event_id}/financials` - Internal financials
- PUT `/api/events/{event_id}/extended` - Extended fields

### Audit
- GET `/api/audit/event/{event_id}`
- GET `/api/audit/proposal/{proposal_id}`

## Locking Rules
- Proposal, OrderItems, and custom fields are editable when:
  - Event.operational_status ≠ Closed
- When Event.operational_status = Closed:
  - All become READ-ONLY permanently

## Database Collections
- `users`, `companies`
- `leads`, `lead_forms`, `clients`, `contacts`
- `events`
- `proposals` (NEW)
- `order_items` (NEW)
- `feature_flags` (NEW)
- `audit_logs` (NEW)
- `document_templates` (NEW)
- `recipes`, `ingredients`
- `item_categories`, `picklist_items`, `tax_rates`

## Known Issues
1. **Google OAuth Login** - BROKEN (Invalid state parameter)

## Completed (Jan 31, 2026)
- [x] Full CRM Refactor with Leads/Clients/Pipeline
- [x] Lead Form Builder with multilingual support
- [x] Proposal/Contract System
- [x] Unified OrderItems (Food, Service, Rental, Fee)
- [x] Internal Margin Tracking
- [x] Feature Flags in Settings
- [x] Event Financials tab
- [x] Audit Logging for post-acceptance changes
- [x] Document generation UI (6 types)
- [x] **Enhanced Picklist System**:
  - Full CRUD (Add, Edit, Delete) from Settings
  - Item Types: Food, Service, Rental, Fee
  - Link to Recipes for auto cost calculation
  - Link to Inventory for disposables/supplies
  - Manual internal_cost override
  - Bulk Add (multiple items at once)
  - Margin % display and cost source tracking

## Upcoming Tasks
- [ ] Fix Google OAuth Login (P0)
- [ ] PDF generation with templates
- [ ] AI integrations for client analysis
- [ ] Finance & Reporting Module
- [ ] CSV Export
