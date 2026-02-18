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
- **Drag & Drop Everywhere:** ✅
  - Timeline List view: Drag activities to reorder and auto-adjust times
  - Room Card Needs: Drag to reorder equipment/amenities
  - Room Card Timeline: Drag activities within room to reorder
- **Copy Setup from Event:** ✅ NEW
  - Button "Copy from event" to copy room configurations from previous events
  - Select source event with preview of rooms, needs, and activities count
  - Options to copy needs and/or timeline separately
  - Automatically generates new IDs for copied items
- **Templates System:** ✅ COMPLETED (February 17, 2026)
  - Predefined reusable room setup templates
  - Categories: Wedding, Corporate, Social, Conference, Gala, Custom
  - System templates: "Boda Clásica", "Conferencia Corporativa", "Gala de Premiación"
  - **Create Template from scratch:** Button "Create Template" in Templates tab opens dialog with all fields (name, description, category, layout type, capacity, notes)
  - **Save as Template:** Sparkles button on each RoomSetupCard opens dialog to save current setup as reusable template
  - **Duplicate Template:** Copy button (blue) on each template card to create variations quickly (NEW)
  - Apply templates to events with one click
  - Delete custom templates (system templates protected)
- **Visual Layout Diagrams:** ✅ NEW (December 2025)
  - SVG visual representations for each layout type (theater, banquet, cocktail, etc.)
  - Upload custom floor plan images (JPG, PNG, WebP up to 5MB)
  - Preview diagrams in room cards and templates
  - Fullscreen view on click
- **PDF Export:** ✅ NEW (December 2025)
  - Export button with dropdown menu
  - Detailed PDF (by room): Complete report organized by room with timeline, needs
  - Summary PDF (schedule): Master chronological schedule of all activities
  - Visual Timeline PDF: Gantt-style visual representation in landscape
  - Print option: Direct browser print
  - Custom branded header with event info
  - Color-coded activity types
- **Activity Types:** 7 types (Setup, Ceremony, Cocktail, Dinner, Entertainment, Breakdown, General) with color coding
- **Hover Tooltips:** Activity details shown on hover in Gantt view
- **Full bilingual support** (EN/ES)

**API Endpoints - Room Setup:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/orchestration/room-setup/templates | Get all templates |
| POST | /api/orchestration/room-setup/templates | Create template |
| POST | /api/orchestration/room-setup/templates/{id}/apply/{event_id} | Apply template |
| POST | /api/orchestration/room-setup/templates/{id}/duplicate | Duplicate template (NEW) |
| POST | /api/orchestration/room-setup/templates/create-from-room/{event_id}/{room_id} | Create from room |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/layout-diagram | Upload diagram |
| GET | /api/orchestration/room-setup/events/{event_id} | Get all room setups for event |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms | Create room setup |
| PUT | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id} | Update room setup |
| DELETE | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id} | Delete room setup |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/needs | Add room need |
| DELETE | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/needs/{item_id} | Remove need |
| POST | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/timeline | Add activity |
| PUT | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/timeline/{activity_id} | Update activity |
| DELETE | /api/orchestration/room-setup/events/{event_id}/rooms/{room_id}/timeline/{activity_id} | Delete activity |
| GET | /api/orchestration/room-setup/events-with-setups | Get events with room setups (for copy) |
| POST | /api/orchestration/room-setup/events/{target}/copy-from/{source} | Copy room setup between events |

**New Files:**
- `/app/backend/models/room_setup.py` - Pydantic models for RoomSetup, RoomNeed, TimelineActivity, Templates
- `/app/backend/routers/room_setup.py` - API endpoints for room setup and templates
- `/app/frontend/src/components/RoomSetupTab.js` - Main component with Gantt/List views
- `/app/frontend/src/components/TemplatesManager.js` - Templates management UI
- `/app/frontend/src/components/VisualLayoutEditor.js` - Visual layout diagram editor

**Test Report:** `/app/test_reports/iteration_36.json` - 12/12 frontend tests passed (100%)

### February 17, 2026 - Template Creation & Gantt Drag Feature

#### Create/Save Template Functionality - COMPLETED ✅
- **Create Template from Templates tab:** Full dialog with name, description, category, layout type, min/max capacity, layout notes
- **Save as Template from Room Card:** Sparkles icon button opens dialog to save existing room setup as template
- **Duplicate Template:** Copy button (blue) on each template card to create variations quickly
- **Deduplication:** Frontend deduplicates templates by template_id to prevent React key conflicts
- **Test Report:** `/app/test_reports/iteration_36.json` - 12/12 tests passed

#### Gantt Chart Drag & Drop - COMPLETED ✅
- **Drag to move:** Click and drag activity bars horizontally to change start/end times
- **Resize from edges:** Hover over left/right edges of bars to resize activities
- **Real-time feedback:** Activity times update visually as you drag
- **5-minute increments:** Times snap to 5-minute intervals for easier scheduling
- **Conflict detection:** Warning shown when activities overlap (NEW)
- **API integration:** Changes are automatically saved to the backend

#### Activity Change History (Audit Log) - COMPLETED ✅
- **Global Activity Log:** Botón en sidebar abre panel con historial de TODOS los módulos
- **Filtros:** Por módulo (CRM, Events, Room Setup, Locations, etc.) y por acción (Create, Update, Delete, etc.)
- **Módulos con logging completo:**
  - CRM (clientes): create, update, delete
  - Events: create, update, delete
  - Locations (venues/rooms): create, update, delete
  - Execution Hub (goals): create, update, delete
  - Demand Studio (campaigns): create, update, delete
  - Business Clarity (invoices/payments): create
  - Add-ons: create (purchase), delete (cancel)
- **Backend genérico:** `/app/backend/utils/activity_logger.py` - función reutilizable `log_activity()`
- **API:** `GET /api/activity-logs/` con filtros (module, entity_type, event_id, user_id, action)
- **Colección MongoDB:** `activity_logs` 
- **UI Global:** `GlobalActivityLog.js` en sidebar con filtros y lista de actividades
- **Formato de log:** log_id, module, action, entity_type, entity_id, entity_name, user_id, user_name, user_email, company_id, timestamp

**API Endpoints - Activity Logs:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/activity-logs/ | Fetch all logs with filters (module, action, limit) |
| GET | /api/activity-logs/entity/{entity_type}/{entity_id} | History for specific entity |
| GET | /api/activity-logs/modules | List all modules with icons/colors |
| GET | /api/activity-logs/actions | List all action types with icons/colors |

#### i18n Audit - COMPLETED ✅
- **Execution Hub:** Kept in English (instead of "Centro de Ejecución")
- **Venues:** All venue-related terms kept in English (Venue, Room, etc.)
- **Reason:** User preference - Spanish translations sounded awkward

### December 2025

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
- ✅ **Fase 1A - Multi-Industry Architecture** (February 18, 2026)
  - Dynamic sidebar based on enabled modules
  - Core modules: System Pulse, Client Engagement, Execution Hub, Business Clarity, Settings
  - Add-on modules: Event Orchestration, Culinary Intelligence, Operations Supplies, Venues, Demand Studio
  - ModulesContext.js for frontend module management
  - `/api/addons/enabled-modules` endpoint
  - Backwards compatible: existing orgs have all modules grandfathered
- ✅ **Fase 1B - Organization Config & Industry Templates** (February 18, 2026)
  - 3 Industry templates: Events & Hospitality, Professional Services, Generic
  - Organization config model with customizable terminology, pipeline stages, event types
  - Settings > Business Type tab for selecting industry template
  - OrgConfigContext.js for frontend config management
  - `/api/org-config` endpoints for config CRUD
  - EventCreate model updated with engagement_type field
- ✅ **Fase 2 - UI Adaptativa (Parcial)** (February 18, 2026)
- ✅ **Dynamic Terminology Refactor (Phase 1)** (December 2025) - NEW
  - **Backend:** Centralized industry configuration in `/app/backend/industry_config_module/industry_config.py`
  - **API:** `/api/addons/enabled-modules` returns `industry_config.program_orchestration` with:
    - Module names (`name_en`, `name_es`)
    - Entity terminology (`entity_singular_en/es`, `entity_plural_en/es`)
    - Field labels (`fields.date`, `fields.guest_count`, `fields.venue`, etc.)
    - Industry-specific entity types
  - **Frontend ModulesContext:** Added helper methods:
    - `getProgramOrchestrationConfig()` - Returns industry config for Program Orchestration
    - `getFieldLabel(fieldKey, lang)` - Returns localized field labels
    - `getEntityTypes()` - Returns entity types for current industry
    - `isEventsIndustry`, `isProfessionalServices`, `isConsulting`, `isGeneric` flags
  - **EventOrchestrationPage.js:** Refactored to use dynamic terminology:
    - Page header, description, entity names
    - Search placeholder, info banners, buttons
    - Tabs conditionally shown based on industry
  - **Dashboard.js:** Refactored "Active Events" section to use dynamic terminology
  - **Supported Industries:** events, agency, consulting, generic
  - **Test Report:** `/app/test_reports/iteration_49.json` - 15/15 tests passed
  - Backend: engagement_type (event/project/service) guardado correctamente
  - Backend: Campos nuevos para projects (scope_summary, deliverables, participant_count)
  - Frontend: Formulario de creación con selector de tipo de trabajo
  - Frontend: Campos condicionales según engagement_type
  - Frontend: Badge de tipo en lista de eventos
- ✅ **Registro con Selección de Industria** (February 18, 2026)
  - Step 1: Selector de industria con 3 opciones (Events, Professional Services, Generic)
  - Step 2: Formulario de cuenta con badge de industria seleccionada
  - Backend: industry_template guardado en company y organization_config creado automáticamente
  - Removido "Business Type" de Settings (ahora es solo admin)
- ✅ **Registro Multi-Paso con Selección de Módulos Add-on** (December 2025) - NEW
  - Step 1: Selección de industria (Events & Hospitality, Professional Services, General Services)
  - Step 2: Selección de módulos add-on con pre-selección basada en industria
    - Events & Hospitality: Pre-selecciona Event Orchestration, Culinary Intelligence, Venues
    - Professional Services: Pre-selecciona Demand Studio
    - General Services: Sin módulos pre-seleccionados
  - Step 3: Creación de cuenta con Google Sign-in o email/password
  - Resumen de pricing: Plan base gratis + costo de módulos seleccionados
  - Badges en Step 3 mostrando industria y módulos seleccionados con total
  - Opción "Skip" para omitir módulos
  - Navegación "Back" entre pasos
  - Test Report: `/app/test_reports/iteration_38.json` - 25/25 tests passed (100%)

- ✅ **Integración Stripe para Pagos de Suscripción** (December 2025) - NEW
  - Checkout de suscripción durante el registro con módulos seleccionados
  - Cálculo de precios server-side (seguridad: nunca confiar en precios del frontend)
  - Módulos y precios:
    - Event Orchestration: $29/mes
    - Culinary Intelligence: $25/mes
    - Operations Supplies: $19/mes
    - Venues & Locations: $15/mes
    - Demand Studio: $35/mes
  - Creación de transacciones en MongoDB antes del redirect a Stripe
  - Webhook de Stripe para confirmación de pago
  - Activación automática de módulos después del pago exitoso
  - Páginas de éxito/cancelación de pago con polling de estado
  - Endpoint para agregar add-ons adicionales después del registro
  - Test Report: `/app/test_reports/iteration_39.json` - 32/32 tests passed (100%)

- ✅ **Panel Super-Admin para Gestión de Módulos** (December 2025) - NEW
  - Vista de todas las organizaciones con filtros (Status, Plan, Industry)
  - Detalle de organización con pestaña "Modules"
  - Gestión de Industry Template (Events & Hospitality, Professional Services, General)
  - Activar/Desactivar módulos para cualquier organización (admin bypass payment)
  - Visualización de módulos activos con precio y estado (purchased/admin_granted)
  - Cálculo y visualización del costo mensual de módulos
  - Log de acciones de admin
  - Test Report: `/app/test_reports/iteration_40.json` - 25/25 tests passed (100%)

- ✅ **Dashboard de Métricas Ejecutivas para Super Admin** (December 2025) - NEW
  - **KPIs principales con gradientes de colores:**
    - MRR (Monthly Recurring Revenue)
    - Clientes de pago vs. total
    - Tasa de conversión (Free → Paid)
    - Total de módulos activos
  - **Estadísticas de crecimiento:**
    - Nuevas organizaciones este mes
    - Nuevos usuarios este mes
    - Total de usuarios
  - **Organizaciones por industria** (gráfico de barras con porcentajes)
  - **Ingresos por módulo** (gráfico de barras con suscripciones y revenue)
  - **Transacciones recientes** (últimas 10 transacciones de pago)
  - **Resumen footer** (Total Orgs, Active Orgs, Paid Transactions, Pending Payments)
  - Test Report: `/app/test_reports/iteration_41.json` - 28/28 tests passed (100%)

- ✅ **Exportación y Sistema de Alertas para Super Admin** (December 2025) - NEW
  - **Exportación a CSV:** Reporte completo con KPIs, industrias, módulos, transacciones
  - **Exportación a Excel:** Archivo XLSX multi-hoja (Summary, By Industry, Revenue by Module, Transactions)
  - **Sistema de Alertas automáticas:**
    - 🔴 Crítico: Tasa de conversión muy baja (<10%)
    - ⚠️ Warning: Pagos pendientes, orgs sin industria, cancelaciones de módulos
    - ℹ️ Info: ARPC bajo, módulos sin revenue
  - Alertas ordenadas por prioridad (crítico → warning → info)
  - Detección automática de anomalías con acciones sugeridas
  - Test Report: `/app/test_reports/iteration_42.json` - 35/35 tests passed (100%)

- ✅ **Unificación de UI y Modelo de Precios por Módulos** (December 2025) - NEW
  - **Super Admin UI** actualizado para coincidir con el estilo visual de Kora OS (tema claro)
  - **BillingSection completamente reescrito:**
    - "My Modules" con lista de módulos activos y precios individuales
    - Total mensual calculado automáticamente ($123/mes con 5 módulos)
    - Botón "Add Module" para agregar módulos adicionales via Stripe
    - Eliminados los planes antiguos (Starter $0, Professional $49, Enterprise $149)
  - **KPI cards** con gradientes de colores pastel que funcionan en tema claro y oscuro
  - Test Report: `/app/test_reports/iteration_43.json` - 16/16 tests passed (100%)

**API Endpoints - Super Admin Module Management:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/super-admin/organizations?industry= | List orgs with industry filter |
| GET | /api/super-admin/organizations/{id}/modules | Get org modules |
| POST | /api/super-admin/organizations/{id}/modules/{key}/activate | Activate module (admin bypass) |
| DELETE | /api/super-admin/organizations/{id}/modules/{key}/deactivate | Deactivate module |
| PUT | /api/super-admin/organizations/{id}/industry | Update industry template |
| GET | /api/super-admin/metrics/dashboard | Get comprehensive dashboard metrics |
| GET | /api/super-admin/metrics/export/csv | Export metrics to CSV |
| GET | /api/super-admin/metrics/export/excel | Export metrics to Excel |
| GET | /api/super-admin/metrics/alerts | Get platform alerts and anomalies |

**API Endpoints - Payments:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/payments/pricing | Get module prices |
| POST | /api/payments/create-subscription-checkout | Create Stripe checkout for registration |
| GET | /api/payments/status/{session_id} | Check payment status |
| POST | /api/payments/add-addon-checkout | Create checkout for additional addon |
| GET | /api/payments/my-subscription | Get user's subscription info |
| POST | /api/payments/webhook/stripe | Handle Stripe webhooks |

### December 18, 2025 - Modelo de Precios Actualizado

#### Nuevo Modelo de Precios - COMPLETED ✅
- **Kora Core - $69/mes** (suscripción obligatoria)
  - Incluye: System Pulse, Execution Hub, Client Engagement, Business Clarity, 1 Location
- **Add-ons opcionales:**
  - Event Suite - $39/mes (Event Orchestration + Venues combinados)
  - Culinary Intelligence - $29/mes
  - Operations Supplies - $19/mes
  - Demand Studio - $39/mes
- **Trial de 7 días** aplica a todo (Core + Add-ons)
- **Super Admin puede editar precios** via `/api/super-admin/pricing`
- **Test Report:** `/app/test_reports/iteration_45.json` - 28/30 tests (100%, 2 skipped por auth)

#### Cambios realizados:
- RegisterPage Step 2: "Power up your business" restaurado, Kora Core con $69 y badge INCLUDED
- BillingSection: Kora Core como suscripción ($69), total mensual con breakdown
- Backend: Nuevos precios, endpoint de pricing dinámico para Super Admin
- Removido: Venues como módulo separado (ahora parte de Event Suite)

## Send Contract to Client Feature (NEW - February 18, 2026) ✅

### Descripción
Funcionalidad para enviar contratos/propuestas generados directamente al cliente via email con:
- Link al portal del cliente donde puede ver/firmar el documento
- Email profesional con branding de la empresa
- Actualización automática del estado del documento a "sent"

### Backend Endpoints
- `POST /api/documents/{document_id}/send` - Enviar documento al cliente

### Features
- **Email Template:** Template profesional en español con:
  - Branding de la empresa (nombre y color)
  - Detalles del evento (nombre, fecha, total)
  - Botón CTA para revisar/firmar documento
  - Link al portal del cliente
- **Status Update:** Documento se marca como "sent" automáticamente
- **Activity Log:** Se registra la acción en el log de actividades
- **Error Handling:** Validaciones para cliente sin email, documento no encontrado, etc.

### Frontend UI
- **Botón Send (verde):** Visible en la pestaña "Generate" para documentos tipo contract/quote no firmados
- **Badge "Sent" (azul):** Se muestra para documentos enviados
- **Toast notifications:** Confirmación de envío exitoso o errores

### Test Report
- `/app/test_reports/iteration_47.json` - 11/11 tests passed (6 backend + 5 frontend)

### Notas
- El envío de emails está **MOCKED** (devuelve status 'skipped') hasta que se configure RESEND_API_KEY
- La lógica completa funciona correctamente, solo falta el API key para envío real

## Document Types by Industry (NEW - February 18, 2026) ✅

### Descripción
Sistema flexible de tipos de documentos que cambia según la industria de la organización.

### Categorías de Documentos
1. **Client-Facing (Estándar para todas las industrias):**
   - Propuesta (quote)
   - Contrato (contract)
   - Factura (invoice)

2. **Internal Documents (Por industria):**
   - **Events & Hospitality:**
     - BEO, Kitchen Sheet, Menu, Mise en Place, Packing List, Timeline
   - **Professional Services:**
     - SOW, Project Brief, Progress Report, Deliverables Checklist, Meeting Notes, Monthly Report
   - **Generic:**
     - Service Order, Work Checklist, Completion Report

### Backend
- `GET /api/settings/document-types` - Devuelve tipos de documento según industria
- Modelo actualizado en `/app/backend/models/organization_config.py`

### Frontend
- UI actualizada en `/app/frontend/src/components/ProposalEditor.js`
- Sección "Client-Facing Documents" y "Internal / Operational Documents" separadas
- Documentos internos muestran descripción como ayuda

## Send to Execution Hub (NEW - February 18, 2026) ✅

### Descripción
Funcionalidad para enviar proyectos/eventos desde Client Engagement a Execution Hub con tareas predeterminadas por industria.

### Backend Endpoints
- `GET /api/execution-hub/default-tasks/{industry}` - Obtiene tareas predeterminadas por industria
- `POST /api/execution-hub/from-event/{event_id}` - Crea Goal con tareas desde un evento/proyecto

### Tareas por Industria
**Events & Hospitality (6 tareas):**
1. Confirmar venue y proveedores
2. Finalizar menú y detalles de catering
3. Coordinar logística y montaje
4. Reunión de pre-evento con equipo
5. Confirmación final con cliente
6. Ejecución del evento

**Professional Services (6 tareas):**
1. Kick-off meeting con cliente
2. Definir entregables y cronograma
3. Configuración inicial del proyecto
4. Revisión de avance semanal
5. QA y control de calidad
6. Entrega final y cierre

**Generic (5 tareas):**
1. Planificación inicial
2. Preparación de recursos
3. Ejecución del servicio
4. Control de calidad
5. Cierre y seguimiento

### Frontend
- Botón "Send to Execution Hub" (verde con 🚀) visible cuando stage=Committed y no hay Goal existente
- Botón "View in Execution Hub" (verde outline con 🎯) cuando ya existe Goal
- Modal con tareas editables antes de confirmar
- Redirección automática a Execution Hub después de crear

### Automation Templates
- **Deal Won → Execution Hub:** Trigger automático cuando deal cambia a "Committed"
- **Project Kickoff Tasks:** Tareas automáticas al iniciar proyecto

### Test Report
- `/app/test_reports/iteration_48.json` - 17/17 tests passed (9 backend + 8 frontend)

## Automation Engine (NEW - December 18, 2025)

### Backend Endpoints
- `GET /api/automation/rules` - List all rules
- `POST /api/automation/rules` - Create new rule
- `GET /api/automation/rules/{rule_id}` - Get specific rule
- `PUT /api/automation/rules/{rule_id}` - Update rule
- `DELETE /api/automation/rules/{rule_id}` - Delete rule
- `POST /api/automation/rules/{rule_id}/toggle` - Toggle active/paused
- `GET /api/automation/templates` - 7 predefined templates (NEW: 2 execution templates)
- `POST /api/automation/templates/{id}/create` - Create from template
- `GET /api/automation/stats` - Statistics
- `GET /api/automation/logs` - Execution logs

### Predefined Templates
1. Lead Welcome - notification + follow-up when lead created
2. Lead Qualification Alert - notify manager for high-value proposals
3. Inactive Client Reactivation - task when client inactive 30 days
4. Event Preparation Reminder - tasks 7 days before event
5. Overdue Follow-up Alert - escalate overdue follow-ups
6. **Deal Won → Execution Hub** (NEW) - auto-create execution goal when committed
7. **Project Kickoff Tasks** (NEW) - create kickoff tasks when project starts

### Test Report
- `/app/test_reports/iteration_46.json` - 27/27 tests passed (100%)

## Upcoming Tasks
- **P1:** Gestión de Presupuestos de Marketing por Cliente/Proyecto (integrado en Client Engagement + Execution Hub)
  - Presupuestos por cliente/proyecto
  - División por canales (Meta Ads, Google Ads, TikTok, etc.)
  - Tracking gasto real vs presupuesto
  - Integración con APIs de ads (Meta, Google) para datos automáticos
  - Visible en Client Portal
- **P2:** Flujo Post-Trial (notificaciones fin de trial de 7 días)
- **P2:** Refactorizar `server.py` (mover rutas a routers separados)
- **P2:** Completar auditoría i18n en componentes nuevos
- **P3:** Integrar Resend para emails transaccionales (BLOQUEADO - esperando RESEND_API_KEY)

## Email Templates Preparados (Pendiente API Key)
- Welcome Email (nuevo usuario)
- Trial Ending Email (notificación de fin de prueba)
- Password Reset Email
- Payment Confirmation Email
- **Contract/Document Send Email** (NEW - para enviar contratos a clientes)

## Future Tasks
- Email Purchase Orders
- Multi-currency support
- Import/export data migration assistance
- Alert notifications for negative operating margin
- End-of-month summary email for finance team

## Test Reports
- `/app/test_reports/iteration_31.json` - Execution Hub Backend 18/18
- `/app/test_reports/iteration_32.json` - Execution Hub Frontend 16/16
- `/app/test_reports/iteration_33.json` - System Pulse Integration 12/12
- `/app/test_reports/iteration_34.json` - Locations 27/27 (15 backend + 12 frontend)
- `/app/test_reports/iteration_35.json` - Room Setup 27/27 (frontend only)
- `/app/test_reports/iteration_37.json` - Activity Logging 18/20 (12 backend + 6 frontend)
- `/app/test_reports/iteration_38.json` - Registration 3-Step Flow 25/25 (frontend only)
- `/app/test_reports/iteration_39.json` - Stripe Payment Integration 32/32 (20 backend + 12 frontend)
- `/app/test_reports/iteration_40.json` - Super Admin Module Management 25/25 (17 backend + 8 frontend)
- `/app/test_reports/iteration_41.json` - Super Admin Metrics Dashboard 28/28 (14 backend + 14 frontend)
- `/app/test_reports/iteration_42.json` - Super Admin Export & Alerts 35/35 (22 backend + 13 frontend)
- `/app/test_reports/iteration_43.json` - UI Unification & Module Pricing 16/16 (frontend only)
- `/app/test_reports/iteration_44.json` - Kora Core & 7-Day Trial UI 16/16 (frontend only)
- `/app/test_reports/iteration_45.json` - Pricing Model Update 28/30 (backend + frontend)
- `/app/test_reports/iteration_47.json` - Send Contract to Client 11/11 (6 backend + 5 frontend)
- `/app/test_reports/iteration_49.json` - **Dynamic Terminology Refactor 15/15 (7 backend + 8 frontend)** - NEW

## Test Data
- **Venue:** "Salón Principal Kora" (Primary, capacity 200)
- **Room:** "Salón Diamante" (capacity 100, floor 1, amenities: WiFi, Proyector, Audio)
- **Room Setup Test Event:** "Evento Demo - Boda" (event_c35238fcb131) with:
  - 1 room setup (Salón Diamante, Banquet layout)
  - 3 needs (Proyector HD, Mesas redondas x15, Sistema de audio)
  - 5 activities (Montaje 14:00-16:00, Ceremonia 17:00-17:45, Cóctel 17:45-19:00, Cena 19:00-21:00, Fiesta 21:00-23:00)

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://industry-config.preview.emergentagent.com
- Production: https://ourkora.com
