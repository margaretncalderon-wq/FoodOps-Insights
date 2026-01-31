# EEP Evoque Events Platform - Product Requirements Document

## Original Problem Statement
Build a cloud-based, modular web platform for event and catering businesses with:
- Client CRM with sales pipeline, status tracking, and client source
- Event Management with documents (BEO, Kitchen Sheet, Packing List, Mise en Place)
- Recipe Costing & Inventory with AI-powered quantity calculations (GastroKaisen-style)
- Customizable Quoting System with discounts and taxes
- Client Portal with digital signatures
- Multilingual UI (Spanish + English)
- Admin Settings Panel
- Full Accounting & Finance module (A/R, A/P, payments)

## User Personas
1. **Event Planner/Admin** - Primary user managing clients, events, recipes, and documents
2. **Chef/Kitchen Staff** - Accesses recipe details, kitchen sheets, and mise en place lists
3. **Client** - External user who views and signs quotes via Client Portal
4. **Finance/Accounting** - Manages invoices, payments, and financial reports

## Core Requirements (Static)
- Multi-tenant architecture with company isolation
- JWT + Google OAuth authentication
- CRUD operations for Clients, Events, Recipes, Ingredients
- Document generation (Quote, BEO, Kitchen Sheet, Packing List, Mise en Place)
- Digital signature with react-signature-canvas
- Multilingual support (EN/ES)
- AI-powered recipe analysis using OpenAI

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI
- **Database**: MongoDB
- **AI Integration**: OpenAI GPT-5.2 via emergentintegrations library
- **Auth**: JWT + Emergent Google OAuth

## What's Been Implemented (January 2026)

### MVP Core Modules ✅
1. **CRM Module**
   - Client CRUD with pipeline stages (Lead, Contacted, Proposal, Negotiation, Won, Lost, Converted)
   - Client source tracking (corporate, planner, referral, direct)
   - Pipeline view and list view toggle
   - Client details page with events history
   - CRM statistics and source reports

2. **Events Module**
   - Event CRUD linked to clients
   - Calendar view with month/year navigation, clickable events
   - Multi-day bookings (is_booking flag, start_date/end_date)
   - Duplicate event/booking functionality
   - Event types (Wedding, Corporate, Birthday, Social, Other)
   - Event status tracking
   - Tasks management
   - Menu items from recipes
   - Stock check for event menus
   - Purchase list generation grouped by supplier

3. **Recipes Module**
   - Recipe builder with ingredient costing (GastroKaisen-style)
   - Sub-recipe support (base, component, final_dish types)
   - AI-powered analysis button (OpenAI integration)
   - Cost per portion/yield calculation with food cost percentage
   - Categories (Appetizer, Main, Dessert, Beverage, etc.)
   - Batch recipe cost recalculation

4. **Inventory Module**
   - Ingredients CRUD with enhanced stock tracking
   - Inventory types (food, packaging, disposable, equipment, event_supply)
   - Par levels and reorder thresholds
   - Low stock alerts
   - Supplier management with SKU mapping
   - Price history tracking
   - Waste/yield percentage calculations
   - Inventory valuation reports
   - Operations inventory for non-food items

5. **Documents Module**
   - All document types (Contract, Proposal, Invoice, BEO, Kitchen Sheet, Packing List, Menu, Mise en Place)
   - Documents linked to events (visible in event details)
   - Digital signature capability
   - Document preview with print support
   - Client portal link sharing
   - Template settings (show_prices, requires_signature per doc type)
   - Automatic discount and tax calculations

6. **Finance Module (NEW)**
   - Client invoices (Accounts Receivable)
   - Supplier invoices (Accounts Payable)
   - Payment tracking (incoming/outgoing)
   - Financial summary dashboard
   - Aging reports for A/R and A/P
   - Cash flow tracking

7. **Suppliers Module (ENHANCED)**
   - Supplier CRUD with delivery schedules
   - Payment terms and minimum orders
   - Supplier item mapping (SKUs)
   - Price comparison across suppliers

### Additional Features ✅
- Multilingual toggle (EN/ES)
- Company branding settings (colors, logo, default tax rate)
- Dashboard with comprehensive statistics
- Responsive design (desktop-first)
- Reports module with recipe costs, price changes, event costs, supplier spend

## Bug Fixes (January 30-31, 2026)
- **CORS Fix**: Changed CORS_ORIGINS from wildcard '*' to explicit origins to support withCredentials cookies
- **RecipesPage Fix**: Updated field names to match backend (cost_per_portion, yield_quantity) with fallbacks
- **Document System Refactor**: Documents now live under Events, not as standalone page
- **DocumentPreview Fix**: Updated to use new Event Order structure with items_by_category and financials

## Updates (January 31, 2026)
- **CRM Enhancement**: Added dual client types - "Corporate" (with company name, RNC, multiple contacts) and "Direct" (individual contact)
- **CRM Validation Fix**: Changed ContactPerson.email from EmailStr to str to allow empty strings
- **CRM Error Handling**: Frontend now properly displays validation error arrays from Pydantic
- **Events Enhancement**: Events endpoint now includes client_info (company_name, client_type)
- **Events UI**: Event titles show "CompanyName - EventName" for corporate clients
- **Multi-day Date Picker**: Verified working - calendar opens and responds to clicks inside Dialog

## Prioritized Backlog

### P0 - Critical (Next Sprint)
- [ ] Build Frontend UI for Finance module (Invoices, Payments, A/R, A/P dashboards)
- [ ] Build Frontend UI for Enhanced Inventory (Operations inventory, par levels)
- [ ] AI integration for supplier pricing suggestions

### P1 - High Priority
- [ ] Payment gateway integration (Stripe/MercadoPago)
- [ ] Email notifications for quotes and events
- [ ] Moodboard feature for Client Portal
- [ ] AI for client behavior analysis

### P2 - Medium Priority
- [ ] Electronic invoicing (Alegra integration)
- [ ] User roles and permissions
- [ ] Automated follow-up reminders
- [ ] Custom document templates content editor

### P3 - Nice to Have
- [ ] Event venue directory
- [ ] Custom fields per company
- [ ] Email templates
- [ ] Automation panel

## API Endpoints Summary

### Authentication
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- POST /api/auth/session - Google OAuth session exchange
- GET /api/auth/me - Get current user
- POST /api/auth/logout - Logout

### CRM
- GET/POST /api/crm/clients - List/create clients
- GET/PUT/DELETE /api/crm/clients/{id} - Client operations
- GET /api/crm/pipeline - Pipeline view
- GET /api/crm/sources - Client source stats
- GET /api/crm/stats - CRM statistics

### Events
- GET/POST /api/events - List/create events
- GET/PUT/DELETE /api/events/{id} - Event operations
- POST /api/events/{id}/duplicate - Duplicate event
- POST /api/events/{id}/tasks - Add task
- GET /api/events/{id}/stock-check - Check stock for event
- POST /api/events/{id}/generate-purchase-list - Generate purchase orders

### Recipes
- GET/POST /api/recipes - List/create recipes
- GET/PUT/DELETE /api/recipes/{id} - Recipe operations
- POST /api/recipes/ai-analyze - AI recipe analysis
- POST /api/recipes/recalculate-all - Batch cost recalculation

### Inventory
- GET/POST /api/inventory/ingredients - List/create ingredients
- GET/PUT/DELETE /api/inventory/ingredients/{id} - Ingredient operations
- POST /api/inventory/ingredients/{id}/adjust - Stock adjustment
- GET /api/inventory/low-stock - Low stock alerts
- GET /api/inventory/valuation - Inventory valuation

### Finance
- GET/POST /api/finance/invoices - Client invoices
- POST /api/finance/supplier-invoices - Supplier invoices
- GET/POST /api/finance/payments - Payment records
- GET /api/finance/summary - Financial dashboard
- GET /api/finance/aging - Aging reports

### Settings
- GET/PUT /api/settings/company - Company settings
- GET/POST/PUT/DELETE /api/settings/templates - Document templates
- GET /api/settings/document-types - Available document types

## Test Credentials
- Email: test@example.com
- Password: password123

## Known Issues
- **Google OAuth**: The "Invalid state parameter" error may occur due to browser cookie settings or session handling. The code implementation is correct but depends on the Emergent Auth service.
