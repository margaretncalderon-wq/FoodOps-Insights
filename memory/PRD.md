# EEP Evoque Events Platform - Product Requirements Document

## Original Problem Statement
Build a cloud-based, modular web platform for event and catering businesses with:
- Client CRM with sales pipeline
- Event Management with documents (BEO, Kitchen Sheet, Packing List, Mise en Place)
- Recipe Costing & Inventory with AI-powered quantity calculations
- Customizable Quoting System
- Client Portal with digital signatures
- Multilingual UI (Spanish + English)
- Admin Settings Panel

## User Personas
1. **Event Planner/Admin** - Primary user managing clients, events, recipes, and documents
2. **Chef/Kitchen Staff** - Accesses recipe details, kitchen sheets, and mise en place lists
3. **Client** - External user who views and signs quotes via Client Portal

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
   - Client CRUD with pipeline stages (Lead, Contacted, Proposal, Negotiation, Won, Lost)
   - Pipeline view and list view toggle
   - Client details page with events history

2. **Events Module**
   - Event CRUD linked to clients
   - Event types (Wedding, Corporate, Birthday, Social, Other)
   - Event status tracking
   - Tasks management
   - Menu items from recipes

3. **Recipes Module**
   - Recipe builder with ingredient costing
   - AI-powered analysis button (OpenAI integration)
   - Cost per serving calculation
   - Categories (Appetizer, Main, Dessert, Beverage, etc.)

4. **Inventory Module**
   - Ingredients CRUD with stock tracking
   - Low stock alerts
   - Suppliers management
   - Categories and units

5. **Documents Module**
   - Document generation from events (Quote, BEO, Kitchen Sheet, Packing List, Mise en Place)
   - Digital signature capability
   - Document preview with print support
   - Client portal link sharing

### Additional Features ✅
- Multilingual toggle (EN/ES)
- Company branding settings (colors, logo)
- Dashboard with statistics
- Responsive design (desktop-first)

## Prioritized Backlog

### P0 - Critical (Next Sprint)
- [ ] Payment gateway integration (Stripe/MercadoPago)
- [ ] Email notifications for quotes and events

### P1 - High Priority
- [ ] Moodboard feature for Client Portal
- [ ] Event timeline/calendar view
- [ ] Automated follow-up reminders
- [ ] Custom document templates per company

### P2 - Medium Priority
- [ ] Inventory rollover reports
- [ ] Revenue vs COGS reports
- [ ] Electronic invoicing (Alegra integration)
- [ ] User roles and permissions

### P3 - Nice to Have
- [ ] Event venue directory
- [ ] Custom fields per company
- [ ] Email templates
- [ ] Automation panel

## Next Tasks
1. Integrate payment gateway (user deferred)
2. Add email notifications
3. Build moodboard feature
4. Implement calendar view for events
5. Add reporting module
