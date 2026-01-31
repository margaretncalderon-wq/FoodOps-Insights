# EEP Evoque Events Platform - PRD

## Overview
Cloud-based, modular web platform for event management with CRM, Event Management, Recipe Costing, Quoting System, and full Proposal/Contract workflow.

## Core Modules

### 1. Authentication
- JWT-based email/password authentication (WORKING ✅)
- Google OAuth via Emergent-managed auth (IMPLEMENTED - needs user verification)

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
- **Operational Status** (Open, In Production, Completed, Closed)
- **Financial Status** (Draft, In Review, Approved)

### 4. Proposal/Contract System
Each Event has ONE active Proposal that serves as:
- Commercial proposal
- Client-facing contract  
- Pricing authority (single source of truth)

### 5. Order Items
Unified commercial engine for all items sold in an event:
- Food (links to recipes for auto cost calculation)
- Service, Rental, Fee (manual internal_cost)

### 6. Food Ops Module V3 (ENHANCED - Jan 31, 2026)

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

## Upcoming Tasks
- [ ] Recipe cost summary should include packaging costs

## Future/Backlog
- [ ] AI integrations for supplier suggestions
- [ ] Integration with Alegra (electronic invoicing)
- [ ] Payment gateways (Stripe, MercadoPago)
- [ ] Expense payment tracking UI
- [ ] Finance & Reporting Module
- [ ] CSV Export
- [ ] Email POs to suppliers
- [ ] PDF export for recipe technical sheets (like GastroKaizen)
