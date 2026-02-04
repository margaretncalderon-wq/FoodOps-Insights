# Kora OS - PRD

## Overview
Cloud-based, modular web platform for event management with CRM, Event Management, Recipe Costing (Culinary Intelligence), Quoting System, and full Proposal/Contract workflow.

**Rebranded: February 3, 2026**
- Platform: "Evoke OS" → "Kora OS"

**Previous Rebrand: January 31, 2026**
- Platform: "Evoque Events Platform" → "Evoke OS"
- Module: "Food Ops" → "Culinary Intelligence"

**Major Refactoring: February 1, 2026**
- Events Module → Sales/Commercial Layer
- Event Orchestration → Execution Layer
- Clear separation: Sales (decision) vs Execution (delivery)

## Architecture Principle
**A single Event entity exists. It moves through layers, not modules.**
- Events = Sales / Decision layer (Should we take this event?)
- Event Orchestration = Execution layer (How do we execute it flawlessly?)

## Core Modules

### 1. Authentication
- JWT-based email/password authentication (WORKING ✅)
- Google OAuth via Emergent-managed auth (WORKING ✅)

### 2. CRM Module (REFINED - Feb 1, 2026) ✅
Reorganized into 6 simplified sections for relationship management:

**1. Lead Outreach**
- Proactive contacts initiated by the team
- Outreach status: New → Contacted → NoResponse → Engaged
- Source = "Outreach"

**2. Lead Inbound**  
- Contacts from forms, email, social
- Source visibility (Website, Instagram, QR, Referral, Email)
- Existing inquiry forms continue working

**3. Follow-ups**
- Unified view of pending follow-ups across leads and clients
- Types: Call, Email, Meeting, Check-in
- Status: Overdue, Today, Upcoming

**4. Comms Log**
- Centralized communication history per contact
- Types: Call, Email, Meeting, Note
- Direction: Inbound/Outbound

**5. Owner Assignment**
- Assign responsibility for each relationship
- Filter by owner
- Unassigned leads/clients highlighted

**6. Clients**
- Contacts with completed events
- Event history (read-only)
- Lifetime value calculation

**Key Rules:**
- CRM manages relationships, Events manages opportunities
- No proposals/contracts created in CRM (they live in Events)
- Single source of truth for contacts

### 3. Events Module (SALES/COMMERCIAL LAYER)
The commercial lifecycle of an event. Answers: "Should we take this event, under what conditions?"

**Supports:**
- Leads, Proposals, Negotiation
- Pricing & margins
- Contracts, Client acceptance
- Go / No-Go decision

**Status Lifecycle:**
- Lead → Contacted → Proposal → Negotiation → Won → Closed (or Lost)

**Rules:**
- Events can exist without execution
- Events in Lead/Proposal/Negotiation cannot be orchestrated
- No operational planning happens here

### 4. Event Orchestration Module (EXECUTION LAYER - Feb 1, 2026) ✅
Manages only **confirmed events** (Won/Closed). Answers: "This event is real. How do we execute it flawlessly?"

**Entry Rule:** Only events with stage Won or Closed appear in Event Orchestration.

**Sub-sections (9 Tabs):**
1. **Event Blueprint**: Objectives, scope, key dates, assumptions, constraints, success criteria
2. **Experience Design**: Color palette, materials, catering setup, moodboard images, zones
3. **Operational Flow**: Phases (Pre/Live/Post), dependencies, readiness status, risks
4. **Run of Show**: Time blocks, action sequences, 4 templates (Wedding, Corporate, Social, Blank)
5. **Team & Roles**: 
   - **Synced Roles**: Auto-populated from contract Service items (read-only quantities, billable)
   - **Operational Roles**: Non-billable additions for execution only
6. **Production Assets**: Packing lists, equipment, checklists
7. **Event Calendar**: Global calendar view with conflict detection
8. **Post-Event Review**: Rating, what worked/failed, deviations, learnings
9. **Event Binder**: Single source of truth - aggregated read-only view of entire event

**Handoff Mechanism:**
- When event stage = Won, it becomes "Execution-enabled"
- Same Event ID is referenced (no duplicate records)
- "Event Orchestration" link appears in Events dropdown for Won/Closed events

**Locking & Governance:**
- When event stage = Closed: All tabs lock except Post-Event Review
- "Close Event" / "Reopen Event" buttons in detail view

### 5. Proposal/Contract System
Each Event has ONE active Proposal that serves as:
- Commercial proposal
- Client-facing contract  
- Pricing authority (single source of truth)

### 6. Order Items
Unified commercial engine for all items sold in an event:
- Food (links to recipes for auto cost calculation)
- Service, Rental, Fee (manual internal_cost)
- **Service items sync to Team & Roles in Orchestration**

### 7. Culinary Intelligence Module V4 (ENHANCED - Jan 31, 2026)

#### 6.0 Recipe Photo & PDF Export (NEW - Jan 31, 2026)
- **Recipe Images**: Upload, view, and delete images for recipes
- **Ficha Técnica (Technical Sheet)**: Export recipe details as PDF
- Backend endpoints: POST/DELETE /api/recipes/{id}/image, GET /api/uploads/{filename}

#### 6.1 Inventory Management
- **Items**: Track food, packaging, disposables, equipment, event supplies
- **Stock Tracking**: Current stock, par levels, low stock alerts
- **Value by Type**: Dashboard showing total value per inventory type
- **Two Preferred Suppliers**: Primary and secondary supplier per item
- **Purchase Details**: purchase_unit, purchase_pack_size, min_order_qty, lead_time_days
- **Price History**: Full audit trail of cost changes with source (Manual, PO, Invoice)

#### 6.2 Suppliers (Enhanced)
- company_name, contact_name, email, phone, address
- **Payment Terms**: Cash, Transfer, Credit, Mixed
- **Credit Management**: has_credit, credit_limit
- **Delivery**: usual_delivery_days
- **Tax ID**: RFC / NIT support

#### 6.3 Advanced Recipe System
**Recipe Types:**
- `Base Recipe` (sauces, stocks, doughs)
- `Component` (sides, elements)  
- `Final Dish` (ready to serve)

**Recipe Composition:**
- Add inventory ingredients with waste factor (merma)
- Sub-recipes as ingredients
- Auto-calculated costs propagate through the recipe tree

**Recipe Portion Formats (NEW):**
- Multiple pricing formats per recipe (Plato, Bowl 12oz, Mini, Tray)
- portions_obtained, portion_unit, sell_price
- target_margin_pct with auto-calculated suggested_price
- cost_per_portion and margin_pct calculations

**Additional Recipe Fields:**
- allergens[] (multi-select from configurable list)
- work_category (prep station / partida de trabajo)
- recipe_code (internal reference)
- verified_status (Draft, Verified)

**Recipe Packaging Formats:**
- Link packaging inventory items to recipes
- qty_per_portion for packaging cost calculations

#### 6.4 Allergens Configuration (NEW)
- 14 default allergens (Gluten, Dairy, Eggs, Shellfish, Peanuts, Tree Nuts, Soy, Fish, Celery, Mustard, Sesame, Sulfites, Mollusks, Lupin)
- Fully configurable via Settings
- Multilingual support (EN/ES)

#### 6.5 Plated Menu System
**Menu Types:** Plated, Buffet, Cocktail, Grab & Go
**Serving Styles:** Plated Service, Family Style, Stations

**Course Structure:**
- Add courses: Appetizer, Salad, Soup, Entree, Dessert, Custom
- Assign Final Dish recipes to courses
- Portions per guest (configurable)

**Menu Pricing (Enhanced):**
- default_guest_count
- sell_price_per_guest with target_margin_pct
- suggested_sell_price_per_guest (auto-calculated)
- tax_included option
- buffer_percentage for waste/contingency

#### 6.6 Purchase Orders System (NEW)
**Full PO Lifecycle:**
- Create PO with supplier and lines
- Status: Draft → Sent → PartiallyReceived → Received → Cancelled
- Generate PO number (PO-YYYY-####)
- needed_by_date, payment_method, notes

**PO Lines:**
- inventory_item_id, item_name, qty_ordered, purchase_unit, unit_cost
- line_total (calculated)
- qty_received tracking

**Receiving Workflow:**
- Receive items with quantity and optional cost override
- Auto-create inventory transactions (Purchase type)
- Auto-update inventory stock levels
- Auto-add price history entries
- Auto-update item cost_per_unit

**Expense Integration:**
- Auto-create expense record on receive
- Link to PO, supplier, invoice details
- Track payment status (Pending, Partial, Paid)

#### 6.7 Consolidated Purchase List (NEW - Scaling Automation)
**Generate from Multiple Events:**
- Select one or more upcoming events
- System calculates required ingredients from:
  - Event guest count
  - Order items of type "Food" with linked recipes
  - Recipe portions_per_yield scaling
  - Sub-recipe ingredient propagation
  - Waste factor (merma) adjustments

**Inventory Comparison:**
- Compare required vs current stock
- Calculate to_purchase quantities
- Show in_stock vs shortages

**Supplier Grouping:**
- Group items by preferred supplier
- Show totals per supplier
- One-click "Create PO" from supplier items

**Buffer Support:**
- Optional 10% buffer for waste/contingency

#### 6.8 Navigation
- Dedicated sidebar at /food-ops
- Sections: Inventory, Recipes, Menus, Purchases, Purchase Orders, Consolidated
- **← Back to Dashboard** link at top

### 7. Feature Flags
Configurable in Settings > Features:
- is_proposal_editing_enabled
- is_order_items_enabled
- is_margin_tracking_enabled
- is_document_autogeneration_enabled
- is_custom_fields_enabled
- is_food_ops_enabled
- is_inventory_enabled
- is_recipe_composition_enabled
- is_plated_menu_enabled
- is_base_recipes_enabled
- is_purchase_list_enabled

### 8. Document Templates
Auto-generated from Event Order:
- Proposal / Contract (PDF)
- Invoice, Packing List, Kitchen Sheet, Service/Setup Sheet

## API Routes

### Food Ops - New Endpoints
- POST `/api/purchase-orders` - Create PO
- GET/PUT/DELETE `/api/purchase-orders/{id}` - PO CRUD
- PUT `/api/purchase-orders/{id}/status` - Update status
- POST `/api/purchase-orders/{id}/receive` - Receive items with expense
- GET/POST `/api/allergens` - Allergen configuration
- GET `/api/inventory/value-summary` - Value by type
- GET/POST `/api/inventory/ingredients/{id}/price-history` - Price audit trail
- GET/POST/PUT/DELETE `/api/recipes/{id}/portion-formats` - Multiple pricing formats
- PUT `/api/recipes/{id}/extended` - Allergens, work_category
- PUT `/api/plated-menus/{id}/extended` - Guest count, pricing
- PUT `/api/suppliers/{id}/extended` - Payment terms, credit
- PUT `/api/inventory/ingredients/{id}/extended` - 2nd supplier, purchase details
- POST `/api/events/generate-purchase-list` - Consolidated scaling
- POST `/api/events/create-po-from-purchase-list` - Auto-create PO
- GET/POST `/api/expenses` - Expense management
- PUT `/api/expenses/{id}/pay` - Record payment

## Database Collections
- `users`, `companies`
- `leads`, `lead_forms`, `clients`, `contacts`
- `events`, `proposals`, `order_items`
- `recipes`, `ingredients`, `suppliers`
- `plated_menus`
- `recipe_portion_formats` (NEW)
- `recipe_packaging_formats` (NEW)
- `allergen_configs` (NEW)
- `inventory_price_history` (NEW)
- `purchase_orders_full` (NEW)
- `expenses` (NEW)
- `inventory_transactions`
- `purchase_lists`
- `feature_flags`, `audit_logs`
- `document_templates`
- `item_categories`, `picklist_items`, `tax_rates`

## Tech Stack
- **Frontend**: React, Shadcn/UI, Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT + Emergent Google OAuth

## Known Issues
1. **Google OAuth Login** - Needs user verification (code implemented, cannot test end-to-end due to external auth provider)

## Completed (Jan 31, 2026)
- [x] Full CRM Refactor with Leads/Clients/Pipeline
- [x] Proposal/Contract System
- [x] Unified OrderItems (Food, Service, Rental, Fee)
- [x] Internal Margin Tracking
- [x] Feature Flags in Settings
- [x] Document generation UI
- [x] Menus / Packages System with Variants
- [x] **Food Ops Module V1**: Inventory, Basic Recipes
- [x] **Food Ops Module V2**: Recipe Types, Sub-recipes, Waste Factor, Plated Menus
- [x] **Food Ops Module V3 (ENHANCED)**:
  - Purchase Orders with full workflow (Create → Send → Receive)
  - Expense auto-creation on receive
  - Consolidated Purchase List from multiple events
  - Automatic recipe scaling by guest count
  - Inventory comparison (required vs stock)
  - One-click PO creation from purchase list
  - Recipe Portion Formats (multiple pricing per recipe)
  - Allergens configuration
  - Inventory Price History
  - Enhanced Supplier (payment terms, credit)
  - Enhanced Inventory (2 suppliers, purchase details)
  - Navigation: Back to Dashboard
- [x] **Food Ops Module V4 (UI Enhancements - Jan 31, 2026)**:
  - RecipeBuilder tabs: Basic, Costing, Details, Packaging
  - Allergens UI in Details tab (14 allergens with checkboxes) - NOW SAVES CORRECTLY
  - Work Station, Recipe Code, Status fields
  - Prep/Cook/Labor time fields
  - PlatedMenuBuilder pricing section with Target Margin %, Default Guest Count
  - Pricing dashboard: Cost per Guest, With Buffer, Suggested Price, Actual Margin, Profit
  - Google OAuth fix implemented - USER VERIFIED WORKING ✅
- [x] **Food Ops Module V5 (Advanced Features - Jan 31, 2026)**:
  - Margin-based Portion Pricing (GastroKaizen style): Auto-calculates Sell Price from Target Margin %
  - Value by Category dashboard (Food, Packaging, Disposable, Equipment, Event Supply)
  - Inventory Price History dialog
  - Primary & Secondary Suppliers per inventory item
  - Purchase Unit and Pack Size fields
  - Supplier Payment Terms (Cash/Transfer/Credit/Mixed) and Credit Limit
  - Print Purchase Orders with preview dialog
- [x] **Food Ops Module V6 (Portion Formats in Menus - Jan 31, 2026)**:
  - Multiple Portion Formats per Recipe (Almuerzo 10oz, Cena 6oz, Mini 4oz, etc.)
  - Each format has: Custom name, Portions obtained from yield, Cost per portion, Sell price based on target margin
  - When adding recipe to menu, dropdown to select which portion format to use
  - Cost automatically updates based on selected format
  - Format selector shows: Standard, and all custom formats with prices
- [x] **System Cleanup (Jan 31, 2026)**:
  - Removed obsolete Menu tab from Events page
  - Reorganized tabs: Contract & Order, Documents, Tasks, Purchases
  - Fixed date display for null/invalid dates (shows TBD instead of 1/1/1970)
  - Verified waste/merma calculations from ingredients
  - Full system integration test passed: 100% backend (19/19), 100% frontend
- [x] **Culinary Intelligence Rebranding (Jan 31, 2026)**:
  - "Food Ops" → "Culinary Intelligence" with tagline "Where food decisions move from intuition to system"
  - Inventory → Supply Intelligence / Inteligencia de Abastecimiento
  - Recipes → Recipe Architecture / Arquitectura de Recetas  
  - Menus → Menu Strategy / Estrategia de Menús
  - Purchases → Procurement / Gestión de Compras
  - Purchase Orders → Vendor Orders / Órdenes a Proveedores
  - Consolidated → Cost & Usage Overview / Resumen de Costos y Consumo
  - Events: "Purchases" tab renamed to "Procurement", obsolete "Menu" tab removed
  - ProposalEditor: "Documents" tab renamed to "Generate" (to avoid confusion with Documents tab in Events)
- [x] **Packaging Formats with Cost Calculation (Jan 31, 2026)**:
  - Packaging dialog shows items from inventory with cost per unit
  - Auto-calculates: Unit Cost × Qty per Portion = Cost per Portion
  - Table shows columns: Item, Qty/Portion, Unit Cost, Cost/Portion, Notes
- [x] **Recipe Photo Upload & PDF Export (Jan 31, 2026)**:
  - Image upload to recipes (POST /api/recipes/{id}/image)
  - Image serving (GET /api/uploads/{filename})
  - Image delete functionality
  - "Technical Sheet" / "Ficha Técnica" PDF export button in RecipeBuilder
- [x] **Platform Rebranding (Jan 31, 2026)**:
  - "Evoque Events Platform" → "Evoke OS"
  - Landing page, Login page, Register page all updated
  - Layout/sidebar updated
- [x] **Business Clarity Module - COMPLETE (Jan 31, 2026)**:
  - Executive Dashboard with KPIs (Receivables, Overdue, Payables, Net Flow)
  - Aging Analysis (Current, 1-30, 31-60, 61-90, 90+ days buckets)
  - Invoice Management (create, list, filter by status/client/event)
  - Payment Engine (create payments, apply to multiple invoices)
  - Stripe Integration (card payments for invoices via checkout)
  - Accounts Receivable Intelligence with aging and risk indicators
  - Accounts Payable Overview (from expenses and supplier payables)
  - Client Financial View (account statements with running balance)
  - Client Credit Context (has_credit, credit_limit, payment_terms)
  - Executive Reports:
    - Financial Snapshot (invoiced, collected, expenses, profit)
    - Client Revenue Report
    - Supplier Spend Report
    - Event Profitability Summary
  - Full audit logging for payments and applications
  - Backend: 20+ new endpoints under /api/business-clarity/
  - Frontend: New BusinessClarityPage with 5 tabs
- [x] **Event-to-Invoice Integration (Jan 31, 2026)**:
  - "Create Invoice" button in Event's Generate tab
  - Invoices created from events link to client and event
  - Auto-calculates totals from order items
  - Invoices appear in Business Clarity for payment tracking
- [x] **Event Payments Tab (Jan 31, 2026)**:
  - New "Payments" tab in Event Details
  - Financial KPIs: Total Invoiced, Collected, Balance Due, % Collected
  - "Record Payment" button with payment method selector
  - "Pay with Card" button for Stripe integration
  - Apply payments to event invoices
  - Client payments history
- [x] **Business Clarity UI Reorganization (Jan 31, 2026)**:
  - Sidebar navigation like Culinary Intelligence
  - Sub-sections: Dashboard, Invoices, Payments, Statements, Receivables, Payables, Reports
  - "Estados de Cuenta" (Account Statements) with client selector
  - Running balance and activity log per client
  - Credit warnings and alerts
  - **CSV/PDF download for account statements**
  - Fixed client endpoint to use /api/crm/clients
- [x] **Business Clarity UI Alignment (Jan 31, 2026)**:
  - Removed Layout wrapper from BusinessClarityPage
  - Sidebar width changed from w-56 to w-64 (matching Culinary Intelligence)
  - Added ArrowLeft icon in "Back to Dashboard" link
  - Descriptive tagline: "Where finances move from numbers to decisions"
  - Navigation paths changed from relative to absolute (/business-clarity/dashboard, etc.)
- [x] **Event Pending Balance Display (Jan 31, 2026)**:
  - Backend: GET /api/events now returns pending_balance calculated from unpaid invoices
  - Backend: GET /api/events/pipeline also returns pending_balance
  - Frontend: List view shows "Pending Balance: $X,XXX" in red when > 0
  - Frontend: Pipeline (Kanban) view shows "Pending: $X,XXX" in red when > 0
  - Added data-testid attributes for testing
- [x] **Settings Module Enhancement (Jan 31, 2026)**:
  - **Users Management**: List, invite, edit, deactivate users
    - API: GET/POST/PUT /api/settings/users
  - **Roles & Permissions**: Admin, Finance, Operations roles
    - Permissions grouped by module: Events, CRM, Culinary, Finance, Settings
    - System roles protected from modification
    - API: GET/POST/PUT/DELETE /api/settings/roles
  - **Automations**: 
    - Payment Reminder (email, days after overdue)
    - Low Stock Alert (email, in_app)
    - Event Reminder (email, days before)
    - Task Due Date notifications
    - New Lead notifications
    - API: GET/POST/PUT/DELETE /api/settings/automations
  - **Integrations**:
    - Alegra (electronic invoicing)
    - QuickBooks (accounting)
    - Gmail (email API)
    - WhatsApp Business (messaging)
    - Stripe (pre-configured)
    - Category filters: Accounting, Communication, Payments
    - API: GET/POST/DELETE /api/settings/integrations
  - New UI components in /app/frontend/src/components/settings/
- [x] **Event Orchestration Module - COMPLETE (Jan 31, 2026)**:
  - New module for event execution intelligence
  - 8 functional tabs:
    1. **Event Blueprint**: Objectives, scope, assumptions, constraints, success criteria
    2. **Experience Design**: Color palette, catering setup, materials, moodboard, zones
    3. **Operational Flow**: Phases (Pre-Event, Live, Post-Event), checklists, risks, dependencies
    4. **Run of Show**: Time blocks with drag-and-drop, 4 templates (Wedding, Corporate, Social, Blank)
    5. **Team & Roles**: Quick add common roles, custom roles with assignees
    6. **Production Assets**: Assets with status tracking, preparation checklist
    7. **Event Calendar**: Global calendar view with conflict detection
    8. **Post-Event Review**: Rating, what worked/failed, deviations, learnings, lock feature
  - Backend: 12+ new endpoints under /api/orchestration/
  - Frontend: New EventOrchestrationPage with sidebar navigation
  - Uses @hello-pangea/dnd for Run of Show drag-and-drop
  - Full bilingual support (EN/ES)
  - Testing: 100% backend (22/22 tests), 100% frontend verified

## Upcoming Tasks
- [ ] **Integrations**: Gmail, WhatsApp, Google Calendar (P1 - User requested)
- [ ] Business Clarity enhancements:
  - CSV/Excel/PDF export for executive reports
  - Email notifications for overdue invoices (requires Gmail integration)
- [ ] Client Credit Context: UI warnings based on credit_limit and payment_terms
- [ ] Finalize Role-Based Access Control (RBAC) logic in backend
- [ ] Email POs to suppliers
- [ ] Multi-currency support

## Completed (February 1, 2026)
- [x] **System Pulse - NEW**:
  - Complete refactor of Dashboard to system-state view
  - Permanent Core: Active Events, Attention Required, Recent Decisions, System Alerts
  - Time Window selector (Now, 7 Days, 30 Days, All)
  - Quick Actions: New Event Opportunity, New Lead, Follow-ups, Communication
  - No charts/KPIs - pure operational awareness
- [x] **Client Engagement UI Refinement**:
  - Sidebar headers now bold (Calendar, Proposals, CRM)
  - Minimal style matching System Pulse
  - Engagement Calendar made more compact
- [x] **Event Orchestration Time Windows**:
  - Added Time Window filter (Now, 7 Days, 30 Days, All)
  - Added micro-signals: ⏱️ Upcoming, ⚠️ Pending, 🔄 Recent, 👥 Team
  - Added subtle legend for micro-signals
- [x] **Engagement Stages (OS-level)**:
  - Replaced sales pipeline with: Inquiry Received → Context Captured → Scope Drafted → Definition In Review → Committed → Archived
  - No more Won/Lost terminology
  - Updated calendar, proposals, and all related views
- [x] **Engagement Calendar Enhancements**:
  - Multi-day Events: Events can now span multiple days
  - Event Times: Added start_time and end_time fields
  - Time Format Preference: 12h/24h configurable in Settings > Preferences
- [x] **Culinary Intelligence - Purchase List Enhancement**:
  - Now generates TWO lists: Stock Requisition (SR) for items in inventory, Purchase List (PL) for items to buy
  - Visual cards showing available vs needed items
- [x] **Vendor Invoice Support**:
  - Added invoice_url field when receiving POs
  - Expenses auto-created link to Business Clarity > Accounts Payable
  - Fields: invoice_number, invoice_date, invoice_url

## Upcoming Tasks
- [ ] **P2: Integrations**: Gmail, WhatsApp Business, Google Calendar
- [ ] **P3: Implement handleEditInvoice** in ProposalEditor.js for existing Edit button

## Recent Fixes (Feb 1, 2026)
- [x] **Pipeline View Legacy Stage Bug**: Fixed events with legacy stages (Won, Lead, Proposal) not appearing in CRM pipeline. Removed duplicate `LEGACY_STAGE_MAP` and `normalize_stage()` definitions in server.py.
- [x] **UI Cleanup & Stage Control**: 
  - Added visible "Engagement Stage" dropdown in EventDetails header
  - Simplified ProposalEditor tabs (removed redundant nested structure)
  - Added stage normalization to individual event endpoint
- [x] **Proposal → Event Stage Automation**: When a proposal status changes to "Accepted", the event automatically moves to "Committed" stage. Visual confirmation message added.
- [x] **Removed Redundant Tabs**: 
  - Eliminated "Documents" tab (documents visible in Generate section within Contract & Order)
  - Eliminated "Procurement" tab (already available in Culinary Intelligence)
  - EventDetails now has only 3 tabs: Contract & Order, Tasks, Payments
- [x] **Cost & Usage Tabs**: Added Pending/Processed tabs to prevent duplicate orders. Events marked "complete" move to Processed with full SR/PL history.
- [x] **Sidebar Cleanup**: Removed "Procurement" from Culinary Intelligence (redundant with Cost & Usage)
- [x] **Production Module**: New module under Culinary Intelligence for converting recipes to prepared stock:
  - Data models: InventoryItem (item_type: RAW/PREPARED, linked_recipe_id), Recipe (produces_stock, default_storage_unit)
  - ProductionBatch model with status flow: PLANNED → IN_PROGRESS → POSTED → VOIDED
  - ProductionLine with computed BOM inputs
  - Posting logic: validates RAW inventory, deducts inputs, creates PREPARED outputs
  - Rules: BASE/COMPONENT always produce stock, DISH only when produces_stock=true
- [x] **Production from SR**: Added "Create Production Batch from SR" button in Cost & Usage
  - New endpoint `/api/production/suggest-from-events` analyzes event menus for BASE/COMPONENT recipes
  - Dialog shows suggested production lines with quantities based on event guest counts
  - Creates batch linked to selected events with auto-generated notes
- [x] **Production Needs (PN) Feature** (Feb 1, 2026):
  - New "Production Needs (PN)" card in Cost & Usage section (purple card)
  - Calculates BASE/COMPONENT sub-recipes needed for selected events
  - Compares required quantities against existing PREPARED inventory
  - Shows: recipe name, type (BASE/COMPONENT), stock, to_produce qty, total cost
  - "Create Batch" button opens dialog to create Production Batch from PN items
  - Backend: `generate_consolidated_purchase_list` now returns `production_needs` array
- [x] **Create Production Batch from Event Detail** (Feb 1, 2026):
  - New "Create Production Batch" button on Event Detail page header
  - Only visible for events in Committed/Won/Closed stages
  - Opens dialog with suggested BASE/COMPONENT recipes for that event
  - Creates Production Batch linked to the event
  - Fixed `/api/production/suggest-from-events` to properly query `order_items` collection

## Completed (February 2, 2026)
- [x] **Operations Supplies Module** - NEW:
  - Separated non-food inventory (equipment, disposables, event_supply) from Culinary Intelligence
  - New sidebar navigation at `/ops-supplies` with sub-sections:
    - Inventory: List/Add/Edit equipment and supplies
    - Purchasing: Track purchases
    - Delivery Notes (Conduces): Check-in/check-out system for event items
    - Maintenance: Placeholder for equipment maintenance tracking
  - Value tracking: Total Value, Reserved Value, Low Stock alerts
  - Primary/Secondary supplier assignment per item
  - Replacement cost field for equipment
  - Upload by Supplier feature (Manual & CSV)
- [x] **Delivery Notes (Conduces) System** - COMPLETE:
  - Check-out items for events (qty_out)
  - Check-in returns (qty_returned)
  - Track lost/damaged items (qty_lost)
  - Equipment returns (must return), Disposables (no return expected)
  - Calculate loss value from replacement_cost × qty_lost
  - Status: pending → returned
  - Backend: GET/POST `/api/delivery-notes`, PUT `/api/delivery-notes/{id}/check-in`
- [x] **Packing List Editor in Event Orchestration** - COMPLETE:
  - New component `PackingListEditor.js` fully integrated
  - Added to Documents tab in Event Orchestration as "Packing List / Setup"
  - Features:
    - Add Items from Operations Supplies inventory
    - Filter by category/search
    - Edit quantity and notes per item
    - Group by type: Equipment (with "Must return" badge), Disposables ("No return")
    - Calculate total replacement cost
    - Save packing list to event (persists)
    - Create Delivery Note directly from packing list
    - View existing Delivery Note with status
  - Backend: GET/PUT `/api/events/{event_id}/packing-list`
- [x] **Bugfix: Operations Supplies Add Item** - SelectItem value error:
  - Fixed `<SelectItem value="">` causing "must have a value prop that is not an empty string" error
  - Changed to `<SelectItem value="none">` with proper handling
- [x] **Procurement Cost Calculation Fix**:
  - Corrected `portions_needed` calculation that was generating inflated quantities
  - Enhanced Procurement Summary to show margin analysis (Quoted vs Expected Spend)
- [x] **Packing List → Delivery Notes Integration** - COMPLETE (Feb 2, 2026):
  - "Crear Conduce" button in PackingListEditor creates Delivery Note with all packing list items
  - Automatic inventory deduction on checkout (qty_out)
  - Items return to inventory on check-in (qty_returned)
  - Lost items tracked with replacement_cost calculation
  - Added `replacement_cost` field to IngredientCreate and Ingredient models
- [x] **Check-in/Check-out E2E Flow** - VERIFIED (Feb 2, 2026):
  - Full workflow tested: Packing List → Create Delivery Note → Checkout (inventory deducted) → Check-in (inventory restored)
  - Loss tracking: qty_lost = qty_out - qty_returned
  - Loss cost calculation: loss_cost = qty_lost × replacement_cost
  - Status flow: pending → returned (all items returned) | partial (some items lost)
  - UI displays Total Losses dashboard, individual item losses, and enables check-in dialog
- [x] **Edit Delivery Notes** - COMPLETE (Feb 2, 2026):
  - Edit items before check-in (add/remove items, change quantities, add notes)
  - Automatic inventory adjustment when editing (restores/deducts based on changes)
  - Only pending notes can be edited
  - Cancel/Delete delivery note option (returns all items to inventory)
  - Backend: PUT /api/delivery-notes/{id}, DELETE /api/delivery-notes/{id}
- [x] **Operations Supplies Enhancements** - COMPLETE (Feb 2, 2026):
  - **Print Delivery Notes**: Professional print layout for event managers/drivers with signature fields
  - **Removed Supplier**: Operations supplies are in-house assets, not tied to suppliers
  - **Cost Center**: Added cost center tracking (Operations, Kitchen, Service, Logistics, Admin)
  - **Depreciation Tracking**: For equipment as fixed assets
    - Purchase date, useful life (years), depreciation rate %
    - Auto-calculates accumulated depreciation and current value
  - **Categories from Settings**: Dynamic category management
    - Add/remove categories from Settings dialog
    - Bilingual support (English/Spanish)
    - Saves to company settings via API
- [x] **Business Clarity Decision-Focused Upgrade** - COMPLETE (Feb 2, 2026):
  - **Executive Dashboard - Profit Signals**:
    - Negative Margin Events count
    - Below Target Margin events (configurable threshold 20-50%)
    - Unassigned Costs total (with margin leakage tooltip)
    - Paid vs Collected Gap (cash flow indicator)
  - **Accounts Payable - Impact Context**:
    - Event/Overhead assignment column
    - "Affects Event Margin" vs "Affects Global Margin" labels
    - Unassigned (Overhead) card with purple highlight
    - Margin Leakage warning alert
  - **Reports Snapshot - Clarity Sections**:
    - Operational Profit (Accrued): Invoiced, Assigned Costs, Gross Profit, Margin
    - Cash Position (Realized): Collected, Paid, Net Cash Flow
    - Clarity note about unassigned expenses
  - **Reports By Event - Decision Map**:
    - Health Badges: ✅ Healthy, ⚠️ Risk, 🔴 Loss
    - Configurable target margin threshold
    - Toggle for Collected/Paid columns
    - Summary badges (count by health status)
    - Decision Guide with actionable recommendations
    - Row highlighting by health status

- [x] **Fixed Costs & Budget Management** - COMPLETE (Feb 2, 2026):
  - **Fixed Cost Categories**:
    - CRUD for overhead cost categories (Rent, Utilities, Payroll, etc.)
    - Active/Inactive status toggle
    - Description field for context
  - **Budgets**:
    - Set budgets per category with period (Monthly, Quarterly, Yearly)
    - Start date configuration
    - Notes field for budget context
    - Upsert logic: updates existing budget for same category+period
  - **Budget vs Actual Analysis**:
    - Period filters (Monthly, Quarterly, Yearly)
    - Year and Month selectors
    - Table showing: Category, Budgeted, Actual, Variance, %, Status
    - Status badges: OK, Warning (>90% used), Over Budget, No Budget
    - Row highlighting for over budget and warning states
    - Summary row with totals
  - **Executive Insights**:
    - Fixed Costs (Period): Total actual spend
    - Avg per Event: Fixed costs divided by event count
    - Break-even per Event: Minimum revenue needed per event
    - Total Variance: Under/over budget indicator
  - **Backend Endpoints**:
    - GET/POST/PUT/DELETE `/api/business-clarity/fixed-costs/categories`
    - GET/POST/DELETE `/api/business-clarity/fixed-costs/budgets`
    - GET `/api/business-clarity/fixed-costs/analysis` - Budget vs actual report
  - **Database Collections**:
    - `fixed_cost_categories`: category_id, name, description, active
    - `fixed_cost_budgets`: budget_id, category_id, period, budget_amount, start_date

- [x] **Overhead → Fixed Cost Category Integration** - COMPLETE (Feb 2, 2026):
  - Added `fixed_cost_category_id` field to expenses and supplier_payables
  - Enhanced Accounts Payable assignment dialog with 3 options:
    - Event (affects event margin)
    - Fixed Cost Category (included in Budget vs Actual)
    - Cost Center (general overhead classification)
  - Updated `/api/business-clarity/payables/{id}/assign` endpoint
  - Expenses assigned to Fixed Cost Categories now appear in Budget vs Actual analysis
  - Refactored `PayablesSection` into separate component at `/components/business-clarity/`

## Known Issues (User Verification Pending)

- [x] **P1: Check-in/Check-out Flow UI Test** - VERIFIED (Feb 2, 2026):
  - Full UI flow tested: Delivery Notes → Check-in dialog → Loss calculation
  - Equipment quantities, returned amounts, and loss costs display correctly
  - Status badges (Pending, Partial, Returned) working
  - Total losses aggregated correctly

- [x] **P3: Invoice Editing in ProposalEditor** - COMPLETE (Feb 2, 2026):
  - Added `handleEditInvoice`, `handleSaveInvoice` functions
  - New edit modal with full invoice editing capabilities:
    - Edit invoice type (Full, Deposit, Final)
    - Edit due date
    - Add/edit/remove invoice lines (description, quantity, price)
    - Discount % and Tax % fields
    - Notes field
    - Real-time totals preview
  - Backend endpoint `/api/finance/invoices/{id}` updated to support more fields
  - Automatic balance_due recalculation when total changes

- [x] **PDF/CSV Export for Reports** - COMPLETE (Feb 2, 2026):
  - Added CSV and PDF export buttons to Executive Reports section
  - Exports work for all 4 report types:
    - Snapshot: Financial summary with operational profit and cash position
    - By Client: Client revenue breakdown
    - By Supplier: Supplier spend analysis
    - By Event: Event profitability with health badges
  - PDF features:
    - Professional formatting with colored headers
    - Health status color-coding in event reports
    - Page numbering
    - Automatic date stamping
  - CSV features:
    - Clean data export for spreadsheet analysis
    - Properly formatted with quoted fields

- [x] **Editable Document Templates** - COMPLETE (Feb 2, 2026):
  - Extended document templates system in Settings page
  - **All Template Types** (Proposal, Invoice, PackingList, KitchenSheet, ServiceSheet):
    - Header text (EN/ES)
    - Footer text (EN/ES)
    - Document Primary Color (hex color picker)
    - Custom Fields support
  - **Proposal-specific**:
    - Customizable section titles (Menu, Services, Rentals) in EN/ES
  - **Invoice-specific**:
    - Terms & Conditions (EN/ES)
    - Payment Instructions (EN/ES)
    - Bank Details
    - Toggle: Show Logo, Show Address, Show Tax ID
  - **PackingList/KitchenSheet-specific**:
    - Display Options toggles:
      - Show Quantities
      - Show Checkboxes
      - Notes Column
      - Group by Category
  - Backend model updated with all new fields
  - Templates saved per company, applied to document generation
  - **Templates Applied to DocumentPreview** - COMPLETE (Feb 2, 2026):
    - Primary color used for headers, borders, table headers
    - Logo/Address/Tax ID visibility controlled by template settings
    - Checkboxes and Notes column displayed for PackingList/KitchenSheet
    - Terms & Conditions, Payment Instructions, Bank Details shown in Invoice/Proposal
    - Print CSS uses template colors for professional output

- [x] **Section Titles and Time for Proposal Items** - COMPLETE (Feb 2, 2026):
  - Added `section_title` and `section_time` fields to order items
  - New fields in Add Item modal: "Section Title" and "Service Time"
  - Items with same section_title are grouped together in document preview
  - Section header shows custom title with date and time
  - Backend models updated (OrderItemCreate, OrderItemUpdate)
  - Proposal template now supports Terms & Conditions with:
    - Terms (EN/ES)
    - Payment Instructions (EN/ES)
    - Bank Details
- **Procurement/Purchases**: Requires recipes to be linked to food items in order_items. Not a code bug, but a workflow requirement
- **Merma (Waste) Calculations**: Implemented correctly in server.py - user to verify

- [x] **BusinessClarityPage.js Major Refactor** - COMPLETE (Feb 2, 2026):
  - Extracted all inline section components to separate files:
    - `/components/business-clarity/DashboardSection.js` (already existed)
    - `/components/business-clarity/PayablesSection.js` (already existed)
    - `/components/business-clarity/InvoicesSection.js` (already existed)
    - `/components/business-clarity/PaymentsSection.js` (already existed)
    - `/components/business-clarity/StatementsSection.js` (already existed)
    - `/components/business-clarity/ReceivablesSection.js` (already existed)
    - `/components/business-clarity/ReportsSection.js` (NEW - extracted)
    - `/components/business-clarity/FixedCostsSection.js` (NEW - extracted)
  - Updated `/components/business-clarity/index.js` to export all 8 components
  - Reduced `BusinessClarityPage.js` from **1,427 lines to 121 lines** (92% reduction)
  - Main page now only contains routing logic and sidebar navigation
  - All functionality preserved, build compiles successfully
  - Improved code maintainability and readability

- [x] **P1: Customizable Proposal Item Types (Multi-tenant)** - COMPLETE (Feb 2, 2026):
  - Added `ProposalItemType` model to backend with type_key, label_en, label_es, color, icon, is_active, sort_order
  - Extended Company model with `proposal_item_types` array
  - Updated GET/PUT `/api/settings/company` to handle item types with defaults (Food, Service, Rental, Fee)
  - Added UI in Settings > Templates tab for managing item types:
    - Edit labels in EN/ES
    - Change colors with color picker
    - Toggle active/inactive
    - Add custom types
    - Cannot delete standard types (Food, Service, Rental, Fee)
  - ProposalEditor now uses dynamic item types with translated labels
  - Tested and verified working

- [x] **P2: Client Credit Warnings** - COMPLETE (Feb 2, 2026):
  - Extended `get_event_proposal` endpoint to calculate client credit usage
  - Returns `client_credit` object with: credit_limit, credit_used, projected_with_proposal, credit_percentage, available_credit
  - Returns `credit_warnings` array with severity levels:
    - HIGH: When proposal would exceed credit limit
    - MEDIUM: When client using ≥80% of credit line
  - Added credit warning banners in ProposalEditor UI
  - Shows red banner for exceeded credit, amber for 80%+ usage
  - Shows blue info banner for clients with credit lines showing available amounts
  - Tested and verified working

- [x] **SaaS Multi-Tenant System** - COMPLETE (Feb 2, 2026):
  - **Data Models:**
    - `Plan` - Subscription plans with limits and feature flags (Starter, Professional, Enterprise)
    - `Subscription` - Organization subscription with status, billing cycle, period dates
    - `UsageMeter` - Monthly usage tracking per organization
    - `Membership` - User membership in organization with role (owner, admin, ops, finance, viewer)
    - `Invitation` - Team invitations with token and expiry
  - **Backend Endpoints (`/api/org/*`):**
    - Plans: GET /plans, GET /plans/{id}
    - Billing: GET /billing, POST /subscription/upgrade, POST /subscription/cancel
    - Usage: GET /usage, GET /usage/check/{metric}
    - Members: GET /members, PUT /members/{id}/role, DELETE /members/{id}
    - Invitations: GET /invitations, POST /invitations, DELETE /invitations/{id}
    - Organization: GET /current, GET /my-organizations, POST /switch/{id}, POST /create
  - **Frontend Components:**
    - `/pages/onboarding/OnboardingPage.js` - 5-step wizard
    - `/components/org/BillingSection.js` - Billing management
    - `/components/org/TeamSection.js` - Team management
    - `/components/org/OrgSwitcher.js` - Organization switcher
  - **Plan Limits:**
    - Starter (Free): 5 events/mo, 2 users, 20 invoices, 10 proposals
    - Professional ($49/mo): 30 events/mo, 10 users, 200 invoices, 50 proposals
    - Enterprise ($149/mo): Unlimited (999)
  - **Roles & Permissions:**
    - OWNER/ADMIN: Full access to billing, members, settings, events, business clarity
    - OPS: Events, inventory, no billing
    - FINANCE: Business clarity, no billing
    - VIEWER: Read-only
  - **Usage Enforcement:**
    - Soft warning at 80% usage
    - Hard block on create actions (events, invitations) when limit exceeded
  - Tested and verified: 15/15 backend tests, 100% frontend success

- [x] **Super Admin Portal** - COMPLETE (Feb 2, 2026):
  - **Access Control:** `/super-admin` route restricted to users with `is_super_admin=true`
  - **Backend Endpoints (`/api/super-admin/*`):**
    - GET /stats - Platform-wide statistics (orgs, users, events)
    - GET /organizations - List all organizations with filters
    - GET /organizations/{id} - Organization detail
    - PUT /organizations/{id}/suspend - Suspend organization
    - PUT /organizations/{id}/reactivate - Reactivate organization
    - POST /bootstrap - Grant first super admin (one-time)
    - POST /grant-super-admin/{email} - Grant super admin to user
  - **CRM Module (NEW):**
    - GET/POST /crm/leads - Platform leads management
    - GET/PUT/DELETE /crm/leads/{id} - Individual lead operations
    - POST /crm/leads/{id}/log - Communication logs
    - GET /crm/follow-ups - Pending follow-ups
    - Tabs: Todos, Inbound, Outreach
    - Pipeline visualization by status
  - **Business Intelligence Module (NEW):**
    - GET /bi/overview - MRR, ARR, paying customers, churn
    - GET /bi/payments - Subscription transactions
    - GET /bi/supplier-invoices - Cross-org invoice data
    - GET /bi/abc-analysis - Customer value classification
    - GET /bi/revenue-trend - 6-month revenue chart
  - **Frontend Pages:**
    - `/pages/super-admin/SuperAdminOverview.js` - Platform dashboard
    - `/pages/super-admin/CRMPage.js` - Sales CRM (NEW)
    - `/pages/super-admin/BIPage.js` - Business Intelligence (NEW)
    - `/pages/super-admin/OrganizationsListPage.js` - All organizations
    - `/pages/super-admin/OrganizationDetailPage.js` - Org details
  - **Bug Fix:** Organizations without `status` field now counted as "active" (legacy data support)
  - Tested and verified working

- [x] **Stripe Billing Integration** - COMPLETE (Feb 2, 2026):
  - **REAL Stripe integration** (not mocked) using `emergentintegrations.payments.stripe.checkout`
  - **Backend Endpoints:**
    - POST /api/org/billing/checkout - Create Stripe checkout session
    - GET /api/org/billing/checkout/status/{session_id} - Check payment status
    - POST /api/org/webhook/stripe - Handle Stripe webhook events
  - **Checkout Flow:**
    1. User clicks "Pay & Upgrade" on billing page
    2. Backend creates Stripe session with plan pricing
    3. User redirected to checkout.stripe.com
    4. After payment, redirected to settings with session_id
    5. Frontend polls status endpoint
    6. On success, subscription activated and dialog shown
  - **Frontend Updates:**
    - Monthly/Yearly toggle with "Save 17%" badge
    - Plan cards with "Pay & Upgrade" buttons
    - Success dialog on payment completion
    - URL param handling for checkout return
  - **Collections:** `subscription_transactions` for payment tracking
  - **Test Key:** sk_test_emergent (real Stripe test mode)
  - Tested and verified: All checkout, status, and webhook endpoints working

- [x] **Super Admin Platform Expenses Management** - COMPLETE (Feb 3, 2026):
  - **Backend CRUD Endpoints (`/api/super-admin/clarity/fixed-costs`):**
    - GET: List all platform fixed costs with summary (total monthly, yearly, by category)
    - POST: Create new platform expense
    - PUT /{cost_id}: Update expense
    - DELETE /{cost_id}: Delete expense
  - **Data Model:**
    - cost_id, name, amount, category, frequency (monthly/yearly), notes
    - Categories: infrastructure, payments, marketing, personnel, other
  - **Frontend Integration:**
    - Fixed Costs tab in Business Clarity showing all expenses
    - KPI cards: Monthly Costs, Annual Costs, Item Count
    - Add/Edit/Delete functionality via dialog
    - Real-time totals calculation
  - **Export Reports:**
    - CSV export with all costs and totals
    - PDF export with executive summary, breakdown by category, and professional formatting
  - **Collection:** `platform_expenses` for platform operational costs
  - Tested and verified: Full CRUD working, UI displaying correctly, exports functional

- [x] **View As Organization Mode** - COMPLETE (Feb 3, 2026):
  - **Backend Endpoints:**
    - POST `/api/super-admin/view-as/{org_id}` - Start read-only view-as mode
    - POST `/api/super-admin/exit-view-as` - Exit view-as mode
    - GET `/api/super-admin/view-as/status` - Check current view-as status
  - **Frontend Integration:**
    - "View As" button on organization detail page
    - Yellow banner when view-as mode is active showing org name
    - "Exit" button to return to normal mode
    - Auto-checks view-as status on Super Admin layout load
  - Support tool for super admins to troubleshoot tenant issues

## Future/Backlog
- [ ] **P0: Deployment** - User has requested deployment multiple times
- [ ] **P1: Finalize Role-Based Access Control (RBAC)** - Ensure backend endpoints for Business Clarity are protected by role checks
- [ ] **P2: Integrations** (User requested): Gmail, WhatsApp Business, Google Calendar
- [ ] Integrations (Settings placeholders): Alegra, QuickBooks
- [ ] Implement actual automation execution (cron jobs for reminders, alerts)
- [ ] AI integrations for supplier suggestions
- [ ] Additional payment gateways (MercadoPago)
- [ ] Email POs to suppliers
- [ ] Multi-currency support
- [ ] Alert notifications for negative operating margin
- [ ] End-of-month email notifications for finance team
- [ ] Client Credit Context UI Warnings

## Recently Completed - Demand Studio Module (Feb 4, 2026)

### Full Marketing Module Implementation ✅
- **Backend Models & Endpoints:**
  - `MarketingCampaign`: brand/acquisition/retention/reactivation campaigns with budget tracking
  - `CampaignChannel`: facebook/instagram/google_ads/email/sms channels per campaign
  - `CampaignSpend`: media/creative/agency/production spend records (online/offline)
  - `CampaignAsset`: image/video/copy/landing_page assets
  - `MarketingActivation`: event/promo/partnership/sampling activations
  - `EmailTracking`: email campaign tracking with opens/clicks
  - `CampaignLeadLink` / `CampaignOpportunityLink`: link campaigns to CRM
  - Full CRUD endpoints under `/api/demand-studio/*`
  - Stats endpoint with MTD/QTD spend, online vs offline breakdown

- **Frontend Pages:**
  - `DemandStudioPage.js`: Main layout with tab navigation
  - `DemandStudioOverview.js`: Dashboard with KPIs (role-aware)
  - `CampaignsPage.js`: Full CRUD for campaigns with filters and access management
  - `ActivationsPage.js`: Marketing activations management
  - `EmailMarketingPage.js`: Email campaign tracking
  - `SpendLedgerPage.js`: Expense tracking with summaries
  - `InsightsPage.js`: ROI metrics (CPL, CPO, budget utilization)
  - `DemandStudioSettings.js`: Placeholder for future settings

- **Navigation:**
  - Added to main sidebar as "Demand Studio"
  - Tabs: Overview, Campaigns, Activations, Email Marketing, Spend Ledger, Insights, Settings

### Marketing Partner Role Implementation ✅
- **New Role:** `marketing_partner` added to `ROLE_PERMISSIONS`
  - Can view and edit assigned campaigns only
  - Cannot see financial data (budget, spend, costs)
  - Cannot create new campaigns or manage access
  
- **Campaign Access System:**
  - `campaign_access` collection for assigning users to campaigns
  - Endpoints: `GET/POST /campaigns/{id}/access`, `DELETE /campaigns/{id}/access/{user_id}`
  - `GET /marketing-partners` - list users with marketing_partner role
  - `GET /my-campaigns` - role-aware campaign list
  - `GET /my-stats` - role-aware statistics
  
- **UI Features:**
  - Owner/Admin can manage campaign access via Users icon
  - Marketing Partners see restricted dashboard (no financial data)
  - Access management dialog with add/remove partner functionality

### Security Fix ✅
- Removed insecure emergency admin endpoint `/api/super-admin/emergency-fix-admin/{email}`

## Recently Completed - Period Close Bug Fix (Feb 3, 2026)

### Critical Bug Fix: `cost_per_unit` Field Correction ✅
- **Issue:** Backend readiness check and inventory valuation calculations were using `unit_cost` field instead of `cost_per_unit`
- **Impact:** Period close was blocked because items appeared to have missing costs
- **Fix Applied:** Updated `/api/business-clarity/period-close/{year}/{month}` endpoint in `server.py`:
  - Changed inventory projection from `{"unit_cost": 1}` to `{"cost_per_unit": 1}`
  - Fixed valuation calculation: `i.get("cost_per_unit", 0)` instead of `i.get("unit_cost", 0)`
- **Verification:** Full end-to-end test completed:
  - Readiness check: `can_close: True`, `has_blockers: False`
  - Period closed successfully with snapshot ID `pclose_818e6bd61a3b`
  - Closing inventory value correctly shows $22,429.14
  - UI displays "Closed" badge with "Reopen Period" button

## Recently Completed - Period Close System (Phase 3) - Feb 3, 2026

### Layered Navigation with Role-Based Permissions
- **Finance Ops** (Blue): Invoices, Payments, Statements, AR, AP
  - Access: Owner, Admin, Finance, Manager, Ops
- **Management Control** (Amber): Fixed Costs & Budget
  - Access: Owner, Admin, Finance, Manager
- **Executive Intelligence** (Purple): Dashboard, Close & Reconciliation, Reports
  - Access: Owner, Admin, Finance

### Special Permissions
- Close Period: Finance+
- Approve Variance: Owner only
- Reopen Period: Owner only

### Physical Inventory Check (Conteo Físico)
- **Backend Endpoints:**
  - GET `/period-close/{year}/{month}/physical-count` - Get count status and items
  - POST `/period-close/{year}/{month}/physical-count` - Save count items
  - POST `/period-close/{year}/{month}/physical-count/apply` - Apply adjustments to inventory
- **UI Features:**
  - Summary cards: Total Items, Counted, Pending, With Variance, Variance Value
  - Search and filter (All, Pending, Counted, With Variance)
  - Inline count input for each inventory item
  - Real-time variance calculation
  - "Save Count" and "Apply Adjustments" buttons
  - Collapsible section with completion percentage badge

### Enhanced Close Period Modal
- Complete snapshot summary with:
  - Inventory valuation cards (Opening, Purchases, Closing, COGS)
  - COGS split (Event vs Overhead)
  - AR Aging breakdown (Current, 1-30, 31-60, 61-90, 90+ days)
  - Cash snapshot summary (if entered)
  - Reconciliation status and gap amount
  - Warnings count display
- Confirmation checkbox with detailed text
- Notes field for close documentation

### Executive Dashboard Integration
- Period status banner showing:
  - Current period name and year
  - Open/Closed status with icon
  - "Live Data" or "Locked Data" badge
  - Closed date information
- Live data indicator when period is open
- Locked data indicator when period is closed

### Executive Reports Integration
- Period status banner matching Dashboard style
- Period selector dropdown to view closed periods
- Reports clearly labeled as "Live" or "Locked" data
- Consistent visual indicator across all Business Clarity sections

## Recently Completed - Period Close System (Phase 2) - Feb 3, 2026

### Alert System
- Automatic alert banner when:
  - There are blocking items (red banner with count)
  - End of month is approaching (amber banner reminder)
- "View Exceptions" quick action button
- Dismissible alert with X button

### Exception Fix Actions
- **Missing Unit Cost:** Input field to set unit cost, updates ingredient via PATCH endpoint
- **Negative Stock:** Input field for correct quantity, creates adjustment with audit trail
- **Unassigned Usage:** Two options:
  - Assign to Event: Select dropdown with company events
  - Categorize as Overhead: Dropdown with categories (Waste, Shrink, Correction, Overhead, Samples)

### Backend Improvements
- `PATCH /api/inventory/ingredients/{id}` - Partial update for unit_cost, stock_quantity
- `POST /api/inventory/ingredients/{id}/adjust` - Enhanced with `adjustment_qty` for absolute values
- Price history logging for cost changes
- Adjustment audit trail with user, timestamp, reason

## Recently Completed - Period Close System (Phase 1) - Feb 3, 2026

### Backend Endpoints Added (`/api/business-clarity/period-close/...`)
- GET `/periods` - List all period close records
- GET `/{year}/{month}` - Get detailed period info with readiness checklist
- GET `/{year}/{month}/exceptions` - Get actionable exceptions with filters
- PUT `/exceptions/{exception_id}` - Update exception (fix, assign, categorize)
- POST `/{year}/{month}/cash-snapshot` - Save manual cash snapshot
- POST `/{year}/{month}/close` - Close period (Finance/Owner only)
- POST `/{year}/{month}/reopen` - Reopen period (Owner only, reason required)
- GET `/{year}/{month}/event-allocation` - COGS allocation preview by event
- GET `/{year}/{month}/audit-log` - Period audit log

### Data Models
- `period_close_snapshots`: Period close records with inventory valuation, COGS allocation, AR aging
- `cash_snapshots`: Manual cash flow snapshots
- `close_exception_log`: Resolution audit trail
- `period_close_audit_log`: Close/reopen audit trail

### Frontend Component: CloseReconciliationSection.js
- Close Readiness Checklist (6 validation items)
- Inventory Valuation Cards (Opening, Purchases, Closing, COGS)
- COGS Allocation (Event vs Overhead split)
- Reconciliation Banner (Balanced/Gap status)
- Cash Management panel with manual snapshot
- Event Allocation Preview (collapsible table)
- Exceptions Table with filters
- Close Period Modal with confirmation
- Reopen Period Modal (Owner only)
