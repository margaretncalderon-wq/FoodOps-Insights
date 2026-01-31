# EEP Evoque Events Platform - Product Requirements Document

## Overview
Cloud-based, modular web platform for event and catering businesses supporting inbound and outbound sales for event planners, venues, caterers, restaurants, and corporate event teams.

## Core Architecture
- **Backend:** FastAPI (Python)
- **Frontend:** React with Shadcn/UI + Tailwind CSS
- **Database:** MongoDB
- **Authentication:** JWT + Emergent-managed Google OAuth

## Current Implementation Status

### ✅ Completed Modules

#### 1. CRM Module (Refactored - Jan 31, 2026)
**Leads System:**
- Lead model with fields: lead_name, email, phone, company_name, event_type, event_date, estimated_guest_count, budget_range, message, source, form_name, status
- Lead statuses: New, Contacted, Converted, Discarded
- Lead sources: Website, Instagram, QR, Referral, Other
- Lead filters by status and source
- Lead conversion logic: Creates Client + Contact + Event automatically
- Converted leads become read-only
- Duplicate prevention by email/company name matching

**Clients System:**
- Client types: Company, Individual
- Fields: display_name, email, phone, address, source, tags, notes, status
- Status: Active, Inactive

**Contacts System:**
- Linked to clients via client_id
- Fields: name, email, phone, role_title, is_primary, is_billing_contact

**Lead Forms:**
- Configurable forms with enabled/required fields
- Default source and event_type settings
- Public endpoints for embedding (no auth required)
- Accessible at /forms/{formId}
- Auto-creates leads on submission

#### 2. Events Module (Updated - Jan 31, 2026)
**Pipeline Stages:** Lead → Contacted → Proposal → Negotiation → Won → Lost
**Views:**
- List view with stage badges
- Pipeline Kanban view with drag-to-move
- Calendar view (redirect)

**Event Fields:**
- event_date (optional, supports TBD)
- event_date_tbd flag
- Multi-day booking support
- stage, expected_value, next_followup_date, next_step, lost_reason (CRM fields)
- Client info displayed in event titles for Company clients

#### 3. Recipe Costing & Inventory
- Recipe builder with ingredients
- Cost per portion calculation
- Inventory tracking
- Stock checking for events
- Purchase list generation

#### 4. Document System
- Contract & Event Order (centralized)
- Auto-generated documents: Proposal, Invoice, Kitchen Sheet, Packing List, Mise en Place
- Item picklist with categories and descriptions
- Tax rates management
- Currency support: USD, RD$

#### 5. Settings
- Company branding
- Item categories
- Picklist items with descriptions
- Tax rates
- Currency selection

### 🔄 In Progress
- Email notifications for new leads

### 📋 Backlog (P1)
- AI integrations for client behavior analysis
- AI supplier price suggestions
- Finance & Reporting module (A/R, A/P, invoices, payments)
- Export to CSV

### 📋 Future (P2)
- Electronic invoicing integration (Alegra)
- Payment gateways (Stripe, MercadoPago)
- Digital signature for quote acceptance
- Multilingual UI refinement (Spanish + English)

## API Endpoints

### Authentication
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/google/exchange-session

### Leads
- GET /api/leads - List leads with filters (status, source, event_type)
- POST /api/leads - Create lead
- GET /api/leads/stats - Lead statistics
- GET /api/leads/{lead_id} - Get lead
- PUT /api/leads/{lead_id} - Update lead
- POST /api/leads/{lead_id}/convert - Convert to Client + Contact + Event
- POST /api/leads/{lead_id}/discard - Mark as discarded

### Clients
- GET /api/crm/clients - List clients
- POST /api/crm/clients - Create client
- GET /api/crm/clients/{id} - Get client with contacts
- PUT /api/crm/clients/{id} - Update client
- DELETE /api/crm/clients/{id} - Delete client
- GET /api/crm/stats - CRM statistics

### Contacts
- GET /api/contacts - List contacts (filter by client_id)
- POST /api/contacts - Create contact
- GET/PUT/DELETE /api/contacts/{id}

### Lead Forms
- GET /api/lead-forms - List forms
- POST /api/lead-forms - Create form
- GET /api/lead-forms/{id}/public - Get form config (public, no auth)
- POST /api/lead-forms/{id}/submit - Submit form (public, no auth)

### Events
- GET /api/events - List events (filter by stage)
- GET /api/events/pipeline - Get pipeline Kanban data
- POST /api/events - Create event
- GET/PUT/DELETE /api/events/{id}
- POST /api/events/{id}/duplicate

## Test Credentials
- Email: test@example.com
- Password: password123

## Known Issues
- Google OAuth "Invalid state parameter" - may occur due to browser cookie settings

## Last Updated
January 31, 2026 - CRM Refactor with Leads System and Pipeline Kanban
