# Kora OS — Product Requirements Document

## Original Problem Statement
Build a comprehensive ERP application called **Kora OS** with modules for People Ops, Business, Demand Studio, Event Orchestration, and CRM. Core focus: Demand Studio (Social Media), CRM scaling, Event Orchestration, global System Settings (i18n, timezone, currency), and a dedicated Launch experience for the May 1–3, 2026 event.

## Target Users
- LATAM creative-industry operators (events, catering, agencies, professional services).
- Bilingual (ES default / EN) with multi-currency and ITBIS tax support.

## Core Architecture
- **Backend**: FastAPI (`/app/backend`), MongoDB, modular routers under `/app/backend/routers`. APScheduler for background jobs.
- **Frontend**: React (`/app/frontend/src`), Tailwind + Shadcn UI + Plus Jakarta Sans, React Router.
- **Internal modules order (general → specific)**: System Pulse → Client Engagement → Execution Hub → Partners → Business Clarity → Demand Generation → Event Orchestration → Culinary Intelligence → Resource Management → Venues → People Ops → Settings.

## Sprint History (Completed)
- Sprint 1: Auth + multi-tenant orgs.
- Sprint 2: CRM + pipeline + leads + clients.
- Sprint 3: Event Orchestration + run-of-show + venues.
- Sprint 4: Email Marketing base + i18n + Locale Settings (currency/timezone).
- Sprint 5 (Q1 2026): Demand Studio expansion (story series, calendar D/W/M, format colors, recurring posts, IG-style feed preview).
- Sprint 6 (Apr 2026): CRM Map (react-leaflet), Dashboard funnel/pipeline alignment, in-app notifications on conversion, follow-ups dialog, Execution Hub privacy, company_entity_id migration.
- Sprint 7 (Apr-May 2026): Launch kit (May 1-3 event), tipografía Plus Jakarta Sans global, Bug fixes (Recipe whitescreen, Demand Studio post overwrite), Performance Dashboard CRM.


### Recipes Bulk Import (CSV/Excel) — Feb 17, 2026
**Goal**: Subir muchas recetas a la vez (al estilo del importador de Items) para usarlas en menús buffet sin tener que crearlas una por una.

**Backend** (nuevo router `recipes_bulk_router` con prefix `/api/recipes-bulk`)
- `GET /api/recipes-bulk/import-template?format=csv|excel` — descarga la plantilla con columnas y 2 filas de ejemplo (Ensalada César, Pollo al limón).
- `POST /api/recipes-bulk/validate-import-file` — devuelve preview por fila (status valid/warning/error, conteo de ingredientes encontrados vs no encontrados, avisos por duplicados, porciones, etc.).
- `POST /api/recipes-bulk/import-from-file?update_existing=bool` — importa, hace matching de ingredientes por nombre contra `db.ingredients`, calcula `total_cost` y `cost_per_portion` con `utils.units.cost_for_recipe_line`. Recetas con ingredientes no matcheados se crean con `needs_review=true`.

**Formato de la columna `ingredientes`**:
`Nombre1: cantidad unidad; Nombre2: cantidad unidad` — ej.: `Lechuga romana: 0.4 kg; Queso parmesano: 80 g`

**Frontend**
- Nuevo `RecipeImportDialog.js` — diálogo de 3 pasos (Seleccionar → Preview → Resultado), con tarjetas de stats (Total / Listas / Con avisos / Con errores), toggle "Actualizar existentes (por nombre)", y descarga de plantilla CSV y Excel.
- Botón "Importar Recetas" agregado en `FoodOpsPage.js` → pestaña Recetas, junto a "Recalcular" y "Nueva Receta".

**Notas de uso**: Las recetas con ingredientes no encontrados quedan marcadas "Por revisar" (badge ámbar) en la lista de recetas; el usuario las abre, enlaza el ingrediente correcto desde el `SearchableSelect` y recalcula.

**Tests E2E (python)** ✅
- Plantilla CSV se descarga (200, 479 bytes, 2 filas ejemplo).
- Validate file: 2 filas detectadas como `warning` (ingredientes no en inventario reportados).
- Import: `{created: 2, updated: 0, errors: []}`, ambas con `needs_review=true`.



### Searchable Selects + Alphabetical Clients/Leads — Feb 17, 2026
**Goal**: Allow typing-to-search in long dropdowns (recipes, ingredients, suppliers, clients, leads) and present clients/leads in alphabetical order everywhere.

**New shared component**: `frontend/src/components/ui/searchable-select.jsx` — typeable combobox built on shadcn Command + Popover. Supports `options[]` with `label / secondary / keywords / disabled`, optional `clearable`, customizable placeholders, and a `testId` hook.

**Applied to (Fase 1)**:
- `PlatedMenuBuilder.js` → **Add Dish** per course (with cost as secondary text)
- `EventsPage.js` → **Clients** in Add Project dialog
- `RecipeBuilder.js` → **Ingredients** selector
- `FoodOpsPage.js` → **Primary / Secondary Supplier** in Item edit modal (clearable)
- `PurchaseOrdersSection.js` → **Supplier** in Create PO
- `MenuEngineeringDialog.js` → **Recipe** in What-If simulator

**Alphabetical sorting added in**:
- `CRMPage.js` (clients + leads)
- `EventsPage.js` (clients)
- `crm/ClientsSection.js` (Clients tab listing)



### Buffet Menu Selection Rules — Feb 17, 2026
**Goal**: Quote Ciano-style dynamic buffet menus ("Choose 1 of 5 salads, 2 of 6 proteins") with a fixed base price per guest and per-course extra-choice surcharges.

**Backend (`server.py`)**
- `MenuCourse` extended with `min_choices`, `max_choices`, `extra_choice_price`.
- `PlatedMenu` / `PlatedMenuCreate` extended with `base_price_per_guest` (0 = use sum of recipe prices).
- `POST /api/proposals/{id}/items/bulk-from-plated-menu` now accepts `selected_items: {course_id: [recipe_id,...]}` to filter dishes and computes extras = Σ max(0, picks − max_choices) × course.extra_choice_price × guests. When `base_price_per_guest > 0`, parent line price = `base × guests + extras`.

**Frontend**
- `PlatedMenuBuilder.js`: New "Precio Base por Invitado" field; per-course Min / Max / Extra Price controls (auto-shown for buffet/cocktail/grab_and_go) with an inline rule preview.
- `BuffetSelectionDialog.js` (new): Opens automatically from ProposalEditor when adding a menu that has selection rules or a base price. Operator picks dishes per course; the dialog enforces min, flags extras over max, and previews `Base × guests`, Extras, and Total Menu in real time before confirming.
- `ProposalEditor.js`: `handleAddPlatedMenu` detects rules/base price and routes through the dialog; passes `selected_items` to the backend.

**Tests**: Python E2E verified — base only ($75 × 20 = $1,500) and base + extras (1 extra salad @ $5 + 1 extra entrée @ $10 × 20 = $1,800).

## Latest Releases

### Culinary UX — Live Cost Preview + Wizard + Review Banner (Feb 14, 2026)
**Goal**: Real-time recipe costing + chef-friendly tools to repair inconsistent ingredient data.

**Backend**
- `POST /api/inventory/ingredients/cost-preview` — Live cost computation per recipe line. Returns `{cost, compatible, base_unit, quantity_in_base, ingredient_unit_kind, message}`. Handles unit conversions (weight↔weight, volume↔volume, weight↔volume via density).
- `IngredientCreate`/`Ingredient` models exposed v2 fields: `base_unit`, `cost_per_base_unit`, `density_g_per_ml`, `purchase_unit`, `purchase_quantity_per_unit`, `purchase_cost`, `needs_review`.

**Frontend**
- `RecipeBuilder.js` → new `IngredientRow` sub-component shows live cost with 4-decimal precision, ⚠️ warning + amber styling for incompatible units, base-unit conversion line below cost.
- `IngredientWizard.js` (new): 4-step guided dialog (Identity → Purchase → Base Unit & Density → Review) with smart defaults (base_unit suggested from category, density auto-hint for oils/water/honey/milk/etc.).
- `FoodOpsPage.js` → Items tab: amber `Review Banner` showing count of ingredients needing repair, opens drawer listing them with per-row "Fix" button that pre-loads the wizard in repair mode. "Wizard" button next to Import/Add Item for guided new-ingredient creation.

**Tests**: Backend 100% (10/10 cost-preview + 8/8 wizard API). Frontend 100% (all wizard flows + banner + drawer verified, name pre-load fixed via component key).

### Performance Dashboard CRM — May 10, 2026
**Goal**: Daily/weekly/monthly performance tracking per salesperson with deltas, leaderboard and alerts.

**Backend**
- `GET /api/crm/reports/performance` — granularity day/week/month, period_offset navigation, returns KPIs+delta, leaderboard with score, sparklines, alerts.
- `POST /api/crm/admin/cleanup-comm-logs` — backfill owner_id, comm_type, log_id (idempotent).
- `POST /api/crm/reports/notify-admin-alerts` — notify org admins via in-app (idempotent per day).
- `scheduler.py` — APScheduler running daily 9am `America/Santo_Domingo` to send alerts automatically.

**Frontend**
- `components/crm/PerformanceTab.js` — replaces "Daily Activity" tab in Sales Report.
- Day/Week/Month tabs + `< Now >` period navigation.
- 12 KPI cards (calls, emails, whatsapp, meetings, notes, new_leads, conversions, follow_ups, proposals, pipeline_value, revenue_closed) each with delta %.
- Team Leaderboard with podium 🥇🥈🥉, sparklines per owner, score bar, goal_pct badge, alert badges.
- Alerts banner with "Notify admins" button.
- Cleanup button integrated.
- Auto "Mi Performance" view for sales role users.

### Bug Fixes — May 7-10, 2026
- **Recipe whitescreen fix**: `RecipeBuilder.js` (3 files) — instructions sent as string (not array), error handler safely stringifies pydantic 422 array errors.
- **Demand Studio post overwrite fix**: `SocialMediaPage.js` — clear `editingPost` state in dialog onOpenChange + on "New Post" button click. Prevents PUT on stale post when user closed edit dialog with X then created a new post.

### Launch Kit — Apr 29, 2026
**Backend**
- `routers/launch.py` — `POST /api/launch/waitlist` + `GET /api/launch/stats` for Founding 100.

**Frontend** — `pages/LandingPage.js` rebuilt:
- New Kora OS logo, sticky launch banner with countdown to May 1, 2026 09:00 EST.
- Hero with dual CTA + interactive mockup stack.
- Event section with stand info + RSVP form.
- 10 module tabs in same order as in-app sidebar with realistic mock visuals.
- Differentiators replacing vanity stats.
- Founding 100 with live scarcity counter, 30% off year 1 offer.
- Pricing $48/mo strikethrough $69 + Founder 100 banner.

### Typography — May 7, 2026
- Title font changed from Playfair Display (serif) to Plus Jakarta Sans (sans-serif).
- Letter-spacing tightened to -0.035em for modern feel.

## Test Credentials
See `/app/memory/test_credentials.md`.

## Key Endpoints
- `GET /api/crm/reports/performance`
- `POST /api/crm/admin/cleanup-comm-logs`
- `POST /api/crm/reports/notify-admin-alerts`
- `POST /api/launch/waitlist` · `GET /api/launch/stats`
- `GET /api/studio/feed/planned`, `GET /api/studio/feed/mixed`
- `POST /api/crm/leads`, `GET /api/crm/pipeline`
- `POST /api/auth/login`, `POST /api/auth/register`

## Backlog (Prioritized)

### P1
- Auto-update `clients.total_revenue` when an event is closed/confirmed.
- Backfill historical `clients.total_revenue` from confirmed events.
- Conversion-by-source report with revenue per channel.
- Logo image upload via Object Storage for guest flow.
- Unified Contact Model (merge Lead + Client into single lifecycle entity).
- Unify Communications components.
- Email confirmation drip post-waitlist (SendGrid/Resend).

### P2
- Refactor `SocialMediaPage.js` (~4400 lines).
- Staffdo.com / Meta IG / TikTok APIs.
- WhatsApp Business API integration.
- Cohort retention analysis (leads by month → conversion at 30/60/90d).
- Forecast based on weighted pipeline.
- Founder Discord auto-invite via webhook.
- Admin dashboard view of `launch_waitlist` (export CSV, mark contacted).

### P3
- A/B test Founding 100 copy.
- Add testimonials section once 3+ beta clients live.
- Conference QR code routing → `/launch?source=qr-stand`.
- Heatmap of activity (calendar tipo GitHub) per salesperson.

## Deployments
- PREVIEW: Auto-deployed to Emergent preview env on every change.
- PRODUCTION: https://ourkora.com (manual redeploy required after preview validation).

## Testing Status
- Latest test reports: `/app/test_reports/iteration_161.json` (Cost Health Dashboard + PicklistItem Staleness — backend 10/10 executed, frontend 6/6 testable; Food Ops section mode untested only because demo admin lacks Culinary module)
- Backend: 100%
- Frontend: 100% (testable surface)

## Last Working Item
Sprint 6 — Notification Deeplinks (May 15, 2026) ✅ COMPLETED.

### Sprint 6 — Notification Deeplinks
Auto-open the most-urgent dialog with preselected context from in-app notification.

- **Backend** (`/app/backend/routers/culinary_digest.py`):
  - `dispatch_digest()` computes a top-level `primary_action: {type, link, label, event_id?, menu_id?}` using priority cascade: variance > staleness > low_stock > mise_en_place > menu_engineering > digest.
  - `link` is `/food-ops/menus?dialog={type}&event_id|menu_id={ctx}` consumable by the FE.
  - Stored in notification.link AND notification.metadata.primary_action AND culinary_digest_history.primary_action.
- **Frontend**:
  - `PlatedMenusSection` now uses `useSearchParams`. On mount, reads `dialog`/`event_id`/`menu_id` params, opens the matching dialog, scrolls to highlighted menu (data-menu-id={id}, ring-2 ring-amber-400), then clears params (no re-trigger).
  - `CostVarianceDialog` accepts `initialEventId` prop. When present, fetches `/api/cost-variance/event/{id}` and renders a prominent "focused event" card (data-testid=cv-focused-event) above the list with theoretical/actual/variance for that event. Closing the dialog clears the state.
- **Tests**: Backend 19/19 + frontend 100%. Report: `/app/test_reports/iteration_175.json`. Pytest: `/app/backend/tests/test_sprint6_deeplinks.py`.

### Sprint 5 — Culinary Weekly Digest (Previously Completed)
Multi-channel digest with 7 toggleable sections, email+in-app, scheduler job. iteration_174.json.

### Phase 2 + Enhancements — Final Tally
| Sprint | Features | Endpoints | UI |
|---|---|---|---|
| 1 | P1-D, P1-B, P1-C | 2 | 1 |
| 2 | P1-A, F6 | 1 + 1 hook | 1 |
| 3 | F1, F2 | 6 | 2 |
| 4 | F3, F4, F5 | 5 | 2 |
| 5 | Weekly Digest | 5 + 1 scheduler | 1 |
| 6 | Deeplinks | (extends dispatch + 1 prop) | (updates 2) |
| **Total** | **12 features** | **20 endpoints** | **7 components** |

### Sprints 1-4 — Phase 2 (Previously Completed)
- Sprint 1: P1-D Staleness + P1-B Filterable Tags + P1-C Scaling Panel (iteration_170.json)
- Sprint 2: P1-A Production Plan + Feature 6 Auto-Release (iteration_171.json)
- Sprint 3: Feature 1 Buffet Factors + Feature 2 Kitchen BEO (iteration_172.json)
- Sprint 4: Feature 3 Menu Engineering + Feature 4 Cost Variance + Feature 5 Plated→Catalog (iteration_173.json)

Previous milestones: Margin Policy Fase 3, Recipe Scaling MVP, Pydantic 422 Error Formatting, Bug fix 401, Cost Health Dashboard, save-scaled-menu fix.

### Calendar UX — Auto-Jump + TBD Bucket (Feb 15, 2026)
**Goal**: Resolve perceived "events not appearing" issue. After Culinary P2 testing (iteration_176), confirmed events DO appear correctly but UX caused confusion: calendar opened in current month which often had 0 events, while events with `event_date=NULL` (TBD) were silently hidden.

**Frontend**
- `CalendarPage.js` (`/calendar`): added `autoJumped` effect that, on first load, finds the nearest month (future preferred) containing an event and sets `currentDate` to it. Added "Events without date" amber card listing all TBD events with Set-date CTA linking to `/events/{id}`.
- `EngagementCalendar.js` (`/client-engagement/calendar`): mirror behavior — auto-jump on first load to closest event-bearing month, TBD bucket below the grid with click-to-open detail.

**Test results** (smoke screenshot): calendar now opens on June 2026 (nearest events) instead of empty May 2026; 6 TBD events listed below grid with "Set date" badge.

Phase 2 Culinary backend validated 19/19 in iteration_176.json.

### Menús en Cotización: Catálogo + Inteligencia Culinaria (May 17, 2026)
**Goal**: Surface BOTH catalog menus (Settings) and Culinary Intelligence menus (Plated/Buffet/Family Style/Cocktail/Grab & Go) in the Proposal Editor so they can be added to a quote with one click.

**Backend** (`server.py`)
- New endpoint `POST /api/proposals/{proposal_id}/items/bulk-from-plated-menu` — accepts `{menu_id, guest_count?, section_title?}`. Iterates over `plated_menus.courses[*].items`, creates one OrderItem per recipe with `quantity = portions_per_guest * guest_count`. Uses default `recipe_portion_format` (if any) for price/cost; falls back to recipe `cost_per_portion` and `default_portion_price`. Section title defaults to `"{menu name} — {course name}"`. Marks items with `loaded_from_plated_menu_id` + `loaded_from_course_id` and stores `_portion_format_id`/`_portion_format_name` for traceability.

**Frontend** (`ProposalEditor.js`)
- `fetchPlatedMenus()` added; called in initial `useEffect`.
- "Agregar Menú" button now always visible (with count badge) so users discover the feature even when one source is empty.
- Unified Add Menu dialog with:
  - **Búsqueda por nombre** (input).
  - Section **"Menús de Inteligencia Culinaria"** with color-coded badges per `serving_style`/`menu_type` (🍽️ Plated, 🥗 Buffet, 👨‍👩‍👧 Family Style, 🍸 Cocktail, 🍴 Stations, 📦 Grab & Go), course/item counts, cost-per-guest and total preview multiplied by event guest count.
  - Section **"Menús del Catálogo"** with existing rich variants/items/margin display.
  - **Empty state** explains both creation paths (Settings catalogs + Culinary Intelligence).
- `handleAddPlatedMenu` calls the new endpoint passing `event.guest_count`.

**Tests**: Backend E2E (curl) — Buffet menu with 2 courses → 2 items in proposal (qty 75 and 50 from portions_per_guest × 50 guests). Frontend lint OK.

### Food Cost / Invitado KPI en Cotización (May 17, 2026)
**Goal**: Surface food cost per guest and food-cost percentage directly in the proposal header so quoting decisions are guided by per-guest economics, not just totals.

**Frontend** (`ProposalEditor.js`)
- New inline KPI in the compact header (next to status badges):
  - Computes `food_cost_per_guest = financials.by_item_type.Food.cost / event.guest_count` (uses `num_guests` fallback).
  - Computes `food_cost_pct = food_cost / food_revenue * 100`.
  - Target = 30% (industry standard).
  - Semáforo: ✅ verde si `pct ≤ 30`; ⚠️ ámbar si `30 < pct ≤ 35`; 🚩 rojo si `pct > 35`.
  - Tooltip muestra totales: costo de comida, ingreso de comida, target %.
  - Solo se renderiza cuando hay invitados + datos de Food.

**Tests**: Backend curl validado — evento con 150 invitados muestra Food cost $27,000 → $180/invitado (51.4%) → debería pintarse rojo. Lint OK.

### Sección con Subtotal y Hora de Servicio (May 17, 2026)
**Goal**: Cuando se agrega un menú a la cotización, ver claramente el nombre del menú como cabecera, los platos debajo, un subtotal por sección que recalcula al añadir/quitar ítems, y una hora de servicio por sección.

**Backend** (`server.py`)
- `OrderItem` response model ahora expone `section_title` y `section_time` (ya existían en Create/Update).

**Frontend** (`ProposalEditor.js`)
- Section header ampliado: agrega badge **subtotal** (`$X.XX`, suma reactiva de `total_price`) y un **input `time`** con icono ⏰ para la hora de servicio.
- Cambiar la hora propaga el valor a todos los items de esa sección (PUT en paralelo, `section_time = HH:MM`).
- El nombre del menú/curso ya se establecía como `section_title` al agregar un menú (catálogo o CI) — no requería cambios.

**Tests**: Backend E2E curl — set `section_time=18:30`, GET items confirma persistencia. Lint frontend OK.

### Hora de Servicio en Kitchen BEO (May 17, 2026)
**Goal**: Que la hora de servicio definida por sección en la cotización aparezca también en el Kitchen BEO (UI + HTML imprimible).

**Backend** (`server.py`)
- `GET /api/kitchen-beo/event/{event_id}` ahora busca el proposal más reciente del evento y pre-carga un mapa `course_id → section_time` desde `order_items.loaded_from_course_id` + `section_time`. Cada curso del payload incluye ahora `service_time`.

**Frontend** (`KitchenBEO.js`)
- UI: Badge `🕐 HH:MM` (amber) en el header de cada curso cuando hay hora.
- HTML print: Style `.course-time` (chip amber) en el header del curso. Layout flex para alinear nombre y hora.

**Tests**: Backend E2E curl — set times `18:30 / 19:30 / 20:30` → Kitchen BEO retorna las mismas horas por curso correctamente. Lint OK.

### Hora Fin + Sub-ítems + Logística por Fecha (May 17, 2026)
**Goal**: Paridad con cotización PDF actual (Ciano Gourmet) — agregar rango de hora de servicio, componentes anidados y logística por día.

**Backend** (`server.py`)
- `OrderItem` Create/Update/response: nuevos campos `section_end_time`, `parent_item_id`.
- `POST /api/proposals/{id}/items` persiste los nuevos campos.
- **Nuevo** `PUT /api/proposals/{id}/day-logistics` — guarda lista `day_logistics: [{event_date, delivery_time, delivery_end_time, address, instructions, guest_count}]`.
- **Nuevo** `GET /api/proposals/{id}/day-logistics`.
- Kitchen BEO: `service_end_time` por curso (paralelo a `service_time`).

**Frontend**
- **ProposalEditor.js**:
  - Section header: ahora muestra **dos inputs** time (`HH:MM → HH:MM`) para hora inicio/fin.
  - Items con `parent_item_id` se renderizan **indentados** debajo del padre (`└─`), con su propio precio (o "incluido"). Botón **`+ Componente`** en cada item top-level crea un sub-ítem (precio 0, hereda section/time) y abre el dialog de edición.
  - **Card "Logística por Fecha"**: collapsible con tabla editable: Fecha · Hora inicio · Hora fin · Invitados · Dirección · Instrucciones · botón quitar. Botón **`+ Agregar fecha`**. Auto-save on blur.
- **KitchenBEO.js**: Badge de hora muestra rango `🕐 18:30 – 19:30` cuando hay end_time (UI + HTML print).

**Tests**: Backend curl E2E (a+b+d) — day_logistics PUT/GET con 2 días persistido, OrderItem creado con `parent_item_id` y `section_end_time=19:30` correctamente. Lint OK.

### Resumen de Catering en Documento/PDF (May 17, 2026)
**Goal**: Inyectar el `day_logistics` ya guardado en la propuesta dentro del documento/PDF generado, replicando el "RESUMEN DE CATERING" del PDF de Ciano.

**Backend** (`server.py`)
- `POST /api/documents/generate/{event_id}/{doc_type}`: `content.day_logistics` ahora se copia desde el proposal asociado.

**Frontend** (`DocumentPreview.js`)
- Nueva sección **"Resumen de Catering / Catering Summary"** justo después del cabezal (cliente/evento), antes de los items.
- Tabla con columnas: **Fecha · Horario (HH:MM – HH:MM) · Invitados · Dirección · Instrucciones**.
- Solo se renderiza si `proposal.day_logistics` no está vacío.
- ProposalEditor pasa `{...proposal, day_logistics: dayLogistics}` al DocumentPreview para asegurar valor actualizado.

**Tests**: Lint OK. (Backend ya validado en E2E previo).

### 4 Estilos Visuales para Documentos (May 17, 2026)
**Goal**: Permitir al usuario escoger entre 4 estilos visuales para sus propuestas/facturas PDF desde Settings, sin perder la lógica de contenido.

**Backend** (`server.py`)
- `DocumentTemplateCreate` / `DocumentTemplate`: nuevo campo `style_variant: str = "classic"` (valores: `classic`, `minimal`, `editorial`, `luxury`).
- `PUT /api/settings/document-templates/{id}` ahora persiste `style_variant` y `primary_color`.

**Frontend Settings** (`SettingsPage.js`)
- En cada card de Document Template (Proposal/Invoice), nuevo **selector visual de estilo** con 4 cards radio:
  - 📄 Clásico (Limpio B/N) — actual
  - 🌿 Minimal Cálido (Notion-style)
  - 📰 Editorial (Revista gourmet)
  - 🌑 Lujo Hotelero (Hotel 5★)
- Click guarda inmediatamente (PUT) y aplica al next preview.

**Frontend DocumentPreview** (`DocumentPreview.js`)
- Root content envuelto con `data-style-variant={template.style_variant}` + clase `doc-root`.
- Inyecta `<style>` con CSS variants completas (mismo DOM, 4 looks distintos):
  - **Minimal Cálido**: tipografía Inter, bordes redondeados, tablas con shadow sutil, total en pill verde, header con gradiente suave.
  - **Editorial**: header full-bleed color marca con tipografía serif (Georgia 36px+), section-titles uppercase con accent bar, tablas sin bordes, total en double-line.
  - **Lujo Hotelero**: header dark con dorado #d4af37, tipografía Cormorant Garamond, section-titles centrados con diamantes ◆, total dark con dorado.
- Print HTML también respeta el variant.

**Tests**: Backend curl E2E — `style_variant` se setea a `luxury`, luego `minimal`, luego `classic` correctamente. Lint frontend OK.

### Pending Mini-tasks & Backlog
- Production SMTP credentials → enable real email delivery for digest.
- Logo Image Upload via Object Storage for Guest Flow (P1).
- Unified Contact Model (P1).
- Refactor `server.py` (~21k líneas) into routers (P2).
- Auto-repair legacy ingredients using AI (P2).

### Rich Item Editor (Inventory) — May 17, 2026
**Goal**: Match feature parity with legacy product editor (descripción, alérgenos, zona de conservación, formato de compra con precio por unidad base auto-calculado, aprovechamiento, historial de precios).

**Backend** (`server.py`)
- Added to `IngredientCreate` and `Ingredient`: `description`, `image_url`, `non_yieldable` (Optional). Existing fields reused: `purchase_unit`, `purchase_quantity_per_unit`, `base_unit`, `purchase_cost`, `cost_per_unit`, `storage_location`, `allergens[]`, `yield_waste_percent`.

**Frontend** (`FoodOpsPage.js` InventorySection)
- Allergens fetched from `/api/allergens` on load.
- Edit/Add Item dialog now includes:
  - **Formato y Precio de Compra** section: dropdown formato (Saco/Caja/Funda/Pack/Galón/Botella/Lata/Bandeja/Unidad), cantidad, unidad base (kg/g/lb/oz/L/ml/unit), precio total del pack, **precio por unidad base live-calculado** (cost_per_unit updated automáticamente). Botón "Historial de Precios" (reusa el dialog existente).
  - **Descripción** (Textarea).
  - **Zona de conservación** (Seco / Refrigerado / Congelado / Temp ambiente).
  - **Aprovechamiento** (input % de merma + checkbox "Merma no aprovechable" + indicador %).
  - **Alérgenos** (chips toggle desde catálogo `/api/allergens`).
- `defaultItemForm()` helper centraliza el reset.

**Tests**: Backend E2E curl pasó (create → update → fetch → delete) con todos los nuevos campos persistidos. Lint frontend OK.

### Picklist ↔ Recipe Portion Format Linking + Bulk Generate (May 17, 2026)
**Goal**: Allow a single catalog (picklist) item to be linked to a specific portion format of a recipe (e.g. Gallon, 12oz, 8oz) instead of just the generic recipe. Item inherits format-specific cost and price. Also bulk-create one item per format with a single click.

**Backend** (`server.py`)
- `enrich_picklist_items` (GET `/api/settings/picklist`) now resolves `recipe_portion_format_id` against `recipe_portion_formats` and adds: `recipe_format_name`, `recipe_format_sell_price`, `recipe_format_suggested_price`, and uses `cost_per_portion` of the format when no manual `internal_cost` exists (cost_source=`recipe_format`).
- `PicklistItemUpdate` nullable_fields now includes `recipe_portion_format_id` so it can be cleared.
- **NEW** `POST /api/recipes/{recipe_id}/generate-picklist-items` — accepts `{format_ids[], category_id, name_prefix?, item_type?, skip_if_exists?}`, creates one picklist item per format (name = `{prefix} - {format_name}`), inherits `sell_price` → `default_price` and links `recipe_id` + `recipe_portion_format_id`. Idempotent via `skip_if_exists`.

**Frontend**
- `SettingsPage.js`: Item Add/Edit dialog now shows "Specific Format / Size" select when a recipe is linked. Auto-fills `default_price`. Picklist row shows a small badge with the format name.
- `RecipeBuilder.js`: New button "📦 Generar ítems de catálogo" (Generate catalog items) next to "Add Format" — only visible if recipe has at least 1 portion format. Opens a dialog with: name prefix, category select, checklist of formats with cost/price preview, idempotent submit.

**Tests**: Backend E2E (curl): single item link enriched correctly; bulk generate creates 3 items, re-run skips 3. Frontend smoke: Item dialog shows format dropdown with cost/price/Default labels.

### Section Reorder via Drag & Drop + Auto-Default Event Date + Non-Consecutive Multi-Day (Feb 19, 2026)
**Goal**: (1) Reorder proposal sections by dragging their headers; (2) auto-prefill event date on every new item/section the user adds; (3) accept non-consecutive multi-day events via `event_dates` array on the Event.

**Backend** (`/app/backend/server.py`, `/app/backend/models/events.py`)
- **NEW** `POST /api/proposals/{proposal_id}/items/bulk-reorder` accepting `{items: [{item_id, sort_order, section_title?}]}` — atomic batch re-stamp of `sort_order` (and optional `section_title`). Returns `{updated, total}`. Filters by `proposal_id + company_id` so foreign IDs are silently skipped (safe; surfaced via `updated < total`).
- `EventUpdate` gains `event_dates: Optional[List[str]] = None`. The PUT `/api/events/{event_id}` handler now sorts ascending, dedupes, and drops empty strings before persisting.
- `EventCreate` already had `event_dates: List[str]`; no changes required.

**Frontend** (`/app/frontend/src/components/ProposalEditor.js`)
- New `SortableSectionWrapper` component wrapping every section. Uses `useSortable({ id: 'sectionhdr::<title>' })` and exposes a render-prop drag handle (data-testid `section-drag-handle-sectionhdr::<title>`) injected at the start of the section header so users see a `GripVertical` icon they can grab.
- The DnD `SortableContext` now contains both `sectionhdr::*` ids and item ids in document order so drag detection works for both.
- `handleDragEndForType` learned a **Branch A** for section drags: computes the new section order list, re-stamps each section's items in a `i*1000+j` band, and POSTs to the new `bulk-reorder` endpoint. Branch B (item drag) is unchanged.
- `resetNewItem()` now pre-fills `event_date` with `dayLogistics[0]?.event_date ?? event.event_date`. Triggered when the **Add Item** button is clicked (both the toolbar button and the empty-state CTA call `resetNewItem()` before opening the dialog) so every freshly-added item inherits the event date by default and the user can still change it.
- The drag handle is `disabled` when the proposal is locked or the section is in rename-edit mode.

**Tests**: Backend pytest (`/app/backend/tests/test_bulk_reorder_event_dates.py`) 5/5 ✅: bulk reorder updates `sort_order` + `section_title`, returns correct counts, 404 on missing proposal, event_dates sorts/dedupes/cleans empties. Frontend Playwright: section drag persists across reload; Add Item modal pre-fills the event date.

### Section ↑ ↓ Arrow Buttons (Feb 19, 2026 — follow-up)
**Goal**: Keyboard/mobile-friendly alternative to the drag handle for users on touch devices.

**Frontend** (`/app/frontend/src/components/ProposalEditor.js`)
- Added small `ArrowUp` / `ArrowDown` buttons next to the drag handle in every section header (visible only when proposal not locked, section not in rename-edit mode, and there are 2+ sections in the item_type).
- First section's ↑ and last section's ↓ are rendered `disabled` with reduced opacity.
- Both arrows call a new shared helper `moveSection(itype, sectionTitle, direction)` which delegates to `persistSectionOrder()` — the same atomic bulk-reorder code path used by the drag handle.
- data-testids: `section-move-up-<title>` / `section-move-down-<title>`.
- Smoke-tested in preview: Entradas/Principales swap via ↓ button persists immediately and shows the "Section moved" toast.

Next: Eliminate ProposalEditor.js bloat (now ~4360 lines) by extracting Sortable wrappers and dialogs; finish UX Workstreams A/B/C; Logo Guest Flow; Unified Contact Model.
