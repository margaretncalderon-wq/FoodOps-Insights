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
- **Operational Status** (Open, In Production, Completed, Closed)
- **Financial Status** (Draft, In Review, Approved)

### 4. Proposal/Contract System
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

### 5. Order Items
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

### 6. Margin Tracking
Internal-only financials visible to Admin/Owner:
- Total revenue
- Total internal cost
- Gross margin (amount and percentage)
- Breakdown by item_type
- Warnings for missing costs and low margins

### 7. Feature Flags
Configurable in Settings > Features:
- is_proposal_editing_enabled
- is_order_items_enabled
- is_margin_tracking_enabled
- is_document_autogeneration_enabled
- is_custom_fields_enabled
- is_food_ops_enabled
- is_inventory_enabled
- is_recipe_composition_enabled (NEW)
- is_plated_menu_enabled (NEW)
- is_base_recipes_enabled (NEW)
- is_purchase_list_enabled

All flags ON by default.

### 8. Document Templates
Auto-generated from Event Order:
- Proposal / Contract (PDF)
- Invoice
- Packing List
- Kitchen Sheet
- Service / Setup Sheet

### 9. Audit Log
Tracks changes after Proposal.status = Accepted:
- User, timestamp
- Action type (add/remove/edit item, status change)
- Impact on totals

### 10. Food Ops Module (NEW - Jan 31, 2026)
Comprehensive food operations management system with dedicated UI at `/food-ops`:

#### 10.1 Inventory Management
- **Items**: Track food, packaging, disposables, equipment, event supplies
- **Stock Tracking**: Current stock, par levels, low stock alerts
- **Suppliers**: Supplier database with contact info
- **Transactions**: Purchase, Usage, Adjustment, Waste tracking

#### 10.2 Advanced Recipe System (NEW - Jan 31, 2026)
**Recipe Types:**
- `Base Recipe` (salsas, fondos, masas) - Purple badge
- `Component` (guarniciones, elementos) - Blue badge  
- `Final Dish` (platos listos para servir) - Green badge

**Recipe Composition:**
- Add inventory ingredients with quantity and unit
- **Waste Factor (Merma)**: `waste_factor_pct` per ingredient (increases effective cost)
- **Sub-Recipes**: Use Base or Component recipes as ingredients in other recipes
- Auto-calculated costs propagate through the recipe tree

**Recipe Features:**
- **Duplicate Recipe**: One-click copy with "(Copy)" suffix
- **Cost History**: Track ingredient price changes over time
- **Cost Per Portion**: Automatically calculated from total cost / portions
- **Food Cost %**: Real-time calculation based on sell price
- Yield quantity, unit, portions per yield
- Prep time, cook time, labor time tracking

#### 10.3 Plated Menu System (NEW - Jan 31, 2026)
Build structured menus for events:

**Menu Types:**
- Plated (Emplatado)
- Buffet
- Cocktail (Coctel)
- Grab & Go (Para Llevar)

**Serving Styles:**
- Plated Service (Servicio Emplatado)
- Family Style (Estilo Familiar)
- Stations (Estaciones)

**Course Structure:**
- Add courses: Appetizer, Salad, Soup, Entree, Dessert, Custom
- Assign Final Dish recipes to courses
- Portions per guest (configurable)
- **Cost Per Guest**: Auto-calculated from all course items
- **Buffer Percentage**: Extra % for waste/contingency

#### 10.4 Purchase Lists
Generate shopping lists for events:
- Group items by supplier
- Compare required vs available stock
- Track purchase status (Draft → Ordered → Received)
- Auto-create inventory transactions on receipt

### 11. Recipe Costing (Legacy - Integrated into Food Ops)
- Ingredient management
- Recipe creation with yield and portions
- Auto cost calculation per serving

### 12. Menus / Packages System
- Create menus that group multiple picklist items
- Each menu has name, description (bilingual), type (Menu/Package/Bundle)
- Fixed price option or calculated sum of items
- Quantity per item in the menu
- Auto-calculated total cost and margin
- Add entire menu to proposal with one click
- **Menu Variants (Gold/Silver/Bronze)**:
  - Create pricing tiers with percentage or fixed discounts
  - Auto-calculated prices and margins per variant
  - One-click add variant to proposal

## Tech Stack
- **Frontend**: React, Shadcn/UI, Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT + Emergent Google OAuth

## API Routes

### Food Ops - Inventory
- GET/POST `/api/inventory/ingredients` - List/create items
- PUT/DELETE `/api/inventory/ingredients/{id}` - Update/delete items
- GET/POST `/api/inventory/transactions` - Transaction history

### Food Ops - Recipes
- GET/POST `/api/recipes` - List/create recipes
- PUT/DELETE `/api/recipes/{id}` - Update/delete recipes
- POST `/api/recipes/{id}/duplicate` - Duplicate recipe (NEW)
- GET `/api/recipes/{id}/cost-history` - Get ingredient cost history (NEW)
- POST `/api/recipes/recalculate-all` - Recalculate all recipe costs

### Food Ops - Plated Menus
- GET/POST `/api/plated-menus` - List/create menus
- PUT/DELETE `/api/plated-menus/{id}` - Update/delete menus

### Food Ops - Suppliers
- GET/POST `/api/suppliers` - List/create suppliers
- PUT/DELETE `/api/suppliers/{id}` - Update/delete suppliers

### Food Ops - Purchase Lists
- GET `/api/purchase-lists` - List purchase lists (filter by event_id)
- GET `/api/purchase-lists/event/{id}/generate` - Generate from event recipes
- POST `/api/purchase-lists` - Create/save purchase list
- PUT `/api/purchase-lists/{id}/status` - Update status

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

## Database Collections
- `users`, `companies`
- `leads`, `lead_forms`, `clients`, `contacts`
- `events`
- `proposals`
- `order_items`
- `feature_flags`
- `audit_logs`
- `document_templates`
- `recipes` (extended with recipe_type, sub_recipes, waste_factor)
- `ingredients` (extended with price_history)
- `suppliers`
- `inventory_transactions`
- `purchase_lists`
- `plated_menus` (NEW)
- `item_categories`, `picklist_items`, `tax_rates`

## Known Issues
1. **Google OAuth Login** - BROKEN (Invalid state parameter) - P1

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
- [x] Enhanced Picklist System with CRUD
- [x] Menus / Packages System with Variants
- [x] Document Templates Editor
- [x] **Food Ops Module V1**:
  - Inventory management (items, suppliers, transactions)
  - Basic recipe system
  - Purchase lists generation
- [x] **Food Ops Module V2 (Advanced)** (NEW):
  - Recipe Types: Base, Component, Final Dish
  - Recipe Composition: Sub-recipes as ingredients
  - Waste Factor (Merma): % per ingredient
  - Recipe Duplication: One-click copy
  - Cost History: Track ingredient price changes
  - Plated Menu Builder: Courses with dishes
  - Cost per Guest calculation with buffer %
  - Dedicated UI at /food-ops with navigation

## Upcoming Tasks
- [ ] Fix Google OAuth Login (P1)
- [ ] PDF generation with templates
- [ ] Connect Purchase Lists to Event Menu
- [ ] UI validation for circular recipe dependencies
- [ ] Finance & Reporting Module
- [ ] CSV Export

## Future/Backlog
- [ ] AI integrations for client analysis
- [ ] AI suggestions for suppliers
- [ ] Integration with Alegra (electronic invoicing)
- [ ] Payment gateways (Stripe, MercadoPago)
