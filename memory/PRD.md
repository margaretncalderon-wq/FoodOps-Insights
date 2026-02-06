# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard overview
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Demand Studio** - Marketing campaigns, social media
7. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented

### February 6, 2026 (Latest Session)
- **Asset Value Report in Business Clarity:** Complete new report for tracking operational assets
  - New backend endpoint: `GET /api/business-clarity/reports/asset-value`
  - Frontend: New "Assets" tab in Executive Reports (ReportsSection.js)
  - Features:
    - Asset Value summary cards (Total Value, Losses, Operational Expense, Billed to Clients)
    - Loss Metrics (Loss Rate, Recovery Rate, Net Loss, Avg per Incident)
    - Assets by Category table with stock and replacement values
    - Losses by Reason breakdown with color-coded cards
    - Monthly Loss Trend visualization
    - Top Losses table with full details
    - CSV and PDF export support for the new report

- **OperationsSuppliesPage.js Refactoring:** Reduced file from 2718 to 92 lines (~97%)
  - Extracted components to `/app/frontend/src/components/operations/`:
    - `InventorySection.js` - Complete inventory management (~1130 lines)
    - `GallerySection.js` - Asset image gallery
    - `AgreementsSection.js` - Contracts & agreements management
    - `PurchasingSection.js` - Purchase orders
    - `CheckInOutSection.js` - Delivery notes (Conduces)
    - `index.js` - Exports and shared constants
  - Main page now only contains routing logic

- **Events Router Extraction (Phase 8 - Started):**
  - Created `/app/backend/routers/events.py` with core CRUD endpoints
  - Added `EventUpdate` model to `/app/backend/models/events.py`
  - Router ready for full migration (endpoints still duplicated in server.py)
  - All functionality preserved and working

### Previous Session
- **Import/Export Feature:** Restored and enhanced with context-based filtering
- **UI Bug Fixes:** Recipe card icons, "CRM: CRM" label fixed
- **Template Engine Fixes:** Company brand colors and currency applied correctly
- **Operations Module:** Added item images, Agreements/Gallery tabs, departure/return dates for delivery notes
- **Asset Loss System:** Registration of losses during inventory count
- **Connected Inventory:** Asset Count now shows items out on delivery
- **Client Portal:** Comprehensive two-tier portal (per-client and per-event views)

### February 6, 2026 (Earlier)
- **UI Consistency Update:** Updated all modules to have consistent header design
- **Login/Register Redesign:** Modern split-screen design inspired by Monday.com/HoneyBook
- **Landing Page Redesign:** Video hero section, compact module highlights

### Previous Sessions
- Full Kora OS rebranding (dark graphite #2A2F3A, Kora Green #AED768)
- Google Auth security fix (new users go to registration flow)
- Welcome email integration with Resend (pending API key)
- Backend refactoring: CRM and Events models extracted from server.py
- Custom favicon and logo

## Pending Issues
- **P1:** Google OAuth `redirect_uri_mismatch` in preview environment (user action required)
- **P2:** Local DB data not persisted (workaround in dependencies.py)
- **P3:** Admin subdomain (admin.ourkora.com) SSL configuration

## Upcoming Tasks
- Continue backend refactoring (Phase 8: Extract Events Router)
- Social Media Campaign Widget
- Activate welcome emails (needs RESEND_API_KEY)
- Refactor OperationsSuppliesPage.js (2500+ lines - needs splitting)

## Integrations
- **Stripe:** Payment processing
- **Google OAuth:** Social login
- **Resend:** Transactional emails (pending API key)

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://brand-template-fix.preview.emergentagent.com
- Production: https://ourkora.com
