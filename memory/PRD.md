# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard with Execution Signals & My Pending widgets
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Execution Hub** - ✅ Operational goals, tasks, decisions tracking
7. **Venues & Locations** - ✅ Company venues, rooms, event locations, room availability
8. **Demand Studio** - Marketing campaigns, social media
9. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented

### February 17, 2026

#### Event Location Management System - 100% Complete ✅
- **Backend (15/15 tests):** Venues CRUD, Rooms CRUD, Saved Addresses, Event Locations
- **Frontend (12/12 tests):** VenuesPage, EventLocationSelector component
- **Features:**
  - Create/edit/delete company venues with full address management
  - Create/edit/delete rooms within venues (capacity, amenities, setup options)
  - Three location types: Onsite (venue/room), Offsite (manual address), Client (use client address)
  - Multi-location events supported (ceremony, cocktail, reception at different places)
  - Saved addresses for quick reuse
  - Full bilingual support (EN/ES)

#### Room Booking & Availability System - NEW ✅
- **Automatic room booking** when event location is set to a room
- **Conflict detection** prevents double booking of the same room
- **Real-time availability check** in location selector when editing events
- **Visual indicators** show available (green) or booked (red with event name)
- **Calendar view** for viewing all room bookings - NEW
- **API Endpoints:**
  - `GET /api/locations/rooms/{id}/availability?date=YYYY-MM-DD` - Check room availability
  - `GET /api/locations/rooms/{id}/bookings?start_date=&end_date=` - Get room bookings
  - `POST /api/locations/rooms/{id}/bookings` - Create manual booking
  - `DELETE /api/locations/rooms/{id}/bookings/{id}` - Cancel booking
  - `GET /api/locations/venues/{id}/availability?date=` - Check all rooms in venue
  - `GET /api/locations/calendar?start_date=&end_date=` - Calendar view of bookings

#### Visual Room Availability Calendar - NEW ✅
- **Monthly calendar view** on Venues page showing room bookings
- **Color-coded rooms** for easy identification
- **Tooltip on hover** showing event name and times
- **Room filter** to view specific room or all rooms
- **Quick venue switching** buttons
- **Today button** and month navigation
- **Stats summary** showing total rooms and bookings count

### December 2025

#### Room Setup Feature in Event Orchestration - NEW ✅
- **New "Room Setup" tab** in Event Orchestration for configuring rooms per event
- **Layout Configuration:** 8 preset layouts (Theater, Banquet, Cocktail, Classroom, U-Shape, Conference, Hollow Square, Custom)
- **Room Needs Management:** Add equipment/amenities per room (A/V, Furniture, Decor, Catering, Technical)
- **Room Timeline:** Define activities with start/end times and responsible person
- **Visual Gantt Timeline:** Horizontal bar chart showing all room activities over time
- **List Timeline View:** Chronological list of all activities with type badges
- **Activity Types:** 7 types (Setup, Ceremony, Cocktail, Dinner, Entertainment, Breakdown, General) with color coding
- **Hover Tooltips:** Activity details shown on hover in Gantt view
- **Full bilingual support** (EN/ES)

**API Endpoints - Room Setup:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/orchestration/room-setup/events/{event_id} | Get all room setups for event |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms | Create room setup |
| PUT | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id} | Update room setup |
| DELETE | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id} | Delete room setup |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/needs | Add room need |
| DELETE | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/needs/{item_id} | Remove need |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/timeline | Add activity |
| PUT | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/timeline/{activity_id} | Update activity |
| DELETE | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/timeline/{activity_id} | Delete activity |
| GET | /api/orchestration/room-setup/events/{event_id}/master-timeline | Get consolidated timeline |
| GET | /api/orchestration/room-setup/layout-templates | Get layout templates |

**New Files:**
- `/app/backend/models/room_setup.py` - Pydantic models for RoomSetup, RoomNeed, TimelineActivity
- `/app/backend/routers/room_setup.py` - API endpoints for room setup
- `/app/frontend/src/components/RoomSetupTab.js` - Main component with Gantt/List views

**Test Report:** `/app/test_reports/iteration_35.json` - 27/27 tests passed (100%)

### February 7, 2026

#### Execution Hub - 100% Complete ✅
- **Backend (18/18 tests):** Goals, Tasks, Decisions, Dependencies, Notes, Access Control
- **Frontend (16/16 tests):** Goals list, detail view, tabs, dialogs
- **System Pulse Integration (12/12 tests):** Execution Signals, My Pending widget

#### Add-ons Marketplace - Complete ✅
- Infrastructure for individual purchases separate from plan
- 8 add-ons available with pricing and compatibility rules

### Test Results Summary
| Phase | Tests | Passed |
|-------|-------|--------|
| Execution Hub Backend | 18 | 18 ✅ |
| Execution Hub Frontend | 16 | 16 ✅ |
| System Pulse Integration | 12 | 12 ✅ |
| Locations Backend | 15 | 15 ✅ |
| Locations Frontend | 12 | 12 ✅ |
| **Total** | **73** | **73 ✅** |

## API Endpoints - Venues & Locations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/locations/venues | List all venues |
| POST | /api/locations/venues | Create venue |
| GET | /api/locations/venues/{id} | Get venue with rooms |
| PUT | /api/locations/venues/{id} | Update venue |
| DELETE | /api/locations/venues/{id} | Soft delete venue |
| POST | /api/locations/venues/{id}/rooms | Create room |
| PUT | /api/locations/venues/{id}/rooms/{id} | Update room |
| DELETE | /api/locations/venues/{id}/rooms/{id} | Delete room |
| GET | /api/locations/saved-addresses | List saved addresses |
| POST | /api/locations/saved-addresses | Create saved address |
| PUT | /api/locations/events/{id}/locations | Update event locations |
| GET | /api/locations/search | Search venues, rooms, addresses |

## API Endpoints - Execution Hub

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/execution-hub/usage | Usage stats vs limit |
| GET | /api/execution-hub/goals | List all goals |
| POST | /api/execution-hub/goals | Create goal |
| GET | /api/execution-hub/goals/{id} | Get goal details |
| PUT | /api/execution-hub/goals/{id} | Update goal |
| DELETE | /api/execution-hub/goals/{id} | Delete goal |
| POST | /api/execution-hub/goals/{id}/tasks | Create task |
| PUT | /api/execution-hub/tasks/{id} | Update task |
| POST | /api/execution-hub/tasks/{id}/notes | Add task note |
| GET | /api/execution-hub/my-pending | My Pending widget |
| GET | /api/execution-hub/signals | System Pulse signals |

## Translation Keys Added - Locations (LanguageContext.js)

### Location Keys (EN/ES)
- `locations` / `Ubicaciones`
- `venues` / `Sedes`
- `rooms` / `Salones`
- `addVenue` / `Agregar Sede`
- `addRoom` / `Agregar Salón`
- `onsite` / `En Sede`
- `offsite` / `Fuera de Sede`
- `clientAddress` / `Dirección del Cliente`
- `multiLocation` / `Múltiples Ubicaciones`
- `selectVenue` / `Seleccionar Sede`
- `selectRoom` / `Seleccionar Salón`
- `arrivalTime` / `Hora de Llegada`
- `departureTime` / `Hora de Salida`
- `setupNotes` / `Notas de Montaje`
- `parkingInstructions` / `Instrucciones de Estacionamiento`

## Files Created/Modified

### New Files
- `/app/backend/models/locations.py` - Pydantic models
- `/app/backend/routers/locations.py` - API endpoints
- `/app/frontend/src/pages/VenuesPage.js` - Venues management page
- `/app/frontend/src/components/EventLocationSelector.js` - Location selector

### Modified Files
- `/app/backend/server.py` - Router registration
- `/app/frontend/src/App.js` - Route for /venues
- `/app/frontend/src/components/Layout.js` - Navigation link
- `/app/frontend/src/contexts/LanguageContext.js` - 50+ new translation keys
- `/app/frontend/src/pages/EventsPage.js` - Integrated EventLocationSelector

## Pending Issues
- **P1:** Complete i18n audit for Dashboard.js (some hardcoded text remains)
- **P2:** Local DB data not persisted
- **P3:** Admin subdomain SSL configuration

## Completed Tasks ✅
- ✅ Event Location Management System (Backend + Frontend)
- ✅ Execution Hub (Backend + Frontend)
- ✅ System Pulse Integration
- ✅ Add-ons Infrastructure
- ✅ i18n Enhancement for Execution Hub and Locations

## Upcoming Tasks
- **P1:** Complete i18n audit for all components
- **P1:** Server.py refactoring (extract remaining routers)
- **P1:** Social Media Campaign Widget
- **P1:** Email notifications (pending RESEND_API_KEY)

## Future Tasks
- Email Purchase Orders
- Multi-currency support
- Import/export data migration assistance

## Test Reports
- `/app/test_reports/iteration_31.json` - Execution Hub Backend 18/18
- `/app/test_reports/iteration_32.json` - Execution Hub Frontend 16/16
- `/app/test_reports/iteration_33.json` - System Pulse Integration 12/12
- `/app/test_reports/iteration_34.json` - Locations 27/27 (15 backend + 12 frontend)
- `/app/test_reports/iteration_35.json` - Room Setup 27/27 (frontend only)

## Test Data
- **Venue:** "Salón Principal Kora" (Primary, capacity 200)
- **Room:** "Salón Diamante" (capacity 100, floor 1, amenities: WiFi, Proyector, Audio)

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://event-setup-1.preview.emergentagent.com
- Production: https://ourkora.com
