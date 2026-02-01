# Evoke OS - PRD

## Overview
Cloud-based, modular web platform for event management with CRM, Event Management, Recipe Costing (Culinary Intelligence), Quoting System, and full Proposal/Contract workflow.

**Rebranded: January 31, 2026**
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
- [ ] Integrations P1: Gmail, WhatsApp Business, Google Calendar

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

## Known Issues (User Verification Pending)
- **Procurement/Purchases**: Requires recipes to be linked to food items in order_items. Not a code bug, but a workflow requirement
- **Merma (Waste) Calculations**: Implemented correctly in server.py - user to verify

## Future/Backlog
- [ ] Integrations (User requested): Gmail, WhatsApp Business, Google Calendar
- [ ] Integrations (Settings placeholders): Alegra, QuickBooks
- [ ] Implement actual automation execution (cron jobs for reminders, alerts)
- [ ] AI integrations for supplier suggestions
- [ ] Additional payment gateways (MercadoPago)
- [ ] Email POs to suppliers
- [ ] Multi-currency support
- [ ] Finalize Role-Based Access Control (RBAC) logic in backend

