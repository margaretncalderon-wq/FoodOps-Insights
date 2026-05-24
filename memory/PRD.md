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


### Hoja de Cocina por Tanda (estilo Ciano) — Feb 23, 2026
- `DocumentPreview.js`: el `groupItems()` ahora detecta documentos operacionales (`kitchen_sheet`, `packing_list`, `mise_en_place`, `beo`) y agrupa items por **fecha + horario de servicio (tanda)** en vez de por categoría/curso.
- Encabezado de tanda formateado como una sola línea: `Lun, 25/05/2026 — 08:15` (con icono de reloj).
- Items dentro de cada tanda se mantienen ordenados por `item_type` (orden configurado en Settings → Catálogos → Tipos de Items) seguido por `sort_order` — así "Bebidas" aparece antes que "Bocadillos" sin necesidad de sub-encabezados.
- Las tandas se ordenan cronológicamente dentro de cada día (08:15 antes que 13:00).
- Documentos cliente (proposal, invoice, menu, contract) mantienen el agrupamiento original por sección/categoría.
- El encabezado de día se oculta en modo operacional porque cada tanda ya muestra la fecha.

  - Cada tanda imprime en su propia hoja (`page-break-before: always` para `.category-section` cuando `data-operational="true"`, excepto la primera que no quema una página en blanco). Permite repartir hojas por turno de cocina.
  - Cada hoja impresa lleva un mini-header con logo + nombre del cliente + lugar + invitados (`position: fixed` + `@page { margin-top: 70px }` solo para docs operacionales). El chef de partida siempre tiene el contexto del evento aunque mueva la hoja entre estaciones.
  - Fix v2: el `position: fixed` no se repetía en print (limitación de Chrome). Reemplazado por un mini-header insertado DENTRO de cada `.category-section` (tanda). Como cada tanda arranca en página nueva, el mini-header queda en la parte superior de cada página automáticamente. Oculto en la primera tanda (page 1 ya tiene el header completo).
  - Logo principal forzado a `max-height: 32px` en docs operacionales para que la página 1 no quede dominada por branding.
  - Fix v3: mini-header + título de tanda movidos DENTRO del `<thead>` de la tabla de items. Como `thead` se repite automáticamente en cada página, ahora si una tanda es larga y se divide en varias páginas, el cliente/lugar/invitados + título de tanda aparecen en cada hoja. También removido `page-break-inside: avoid` en docs operacionales para permitir tandas largas que cruzan páginas sin mezclarse con otras tandas (`page-break-before: always` sigue garantizando que tandas distintas nunca compartan página).
  - Fix v4: (1) Logo achicado a `max-height: 18px / max-width: 80px` en el mini-header de tanda y `max-height: 28px / max-width: 120px` en el header principal de docs operacionales. (2) Eliminado el resumen global RESUMEN DE CATERING en docs operacionales — ahora cada tanda lleva en su `<thead>` una caja con la información logística del día (Horario, Invitados, Dirección, Instrucciones) leída de `proposal.day_logistics` y filtrada por la fecha de la tanda. Como vive en `<thead>`, se repite con el resto del header en cada página de la tanda.



### Hoja de Cocina Batch — agrupación por tanda (Feb 23, 2026)
- Bug en producción: el batch print "Hojas de Cocina — Imprimir en lote" generaba una página por CATEGORÍA (Bocadillos, Bebidas, Desechables) en vez de una por tanda/horario.
- Causa raíz: `get_kitchen_beo()` (server.py:4138) usaba `(date, section_title, section_time, section_end_time)` como clave de bucket. Cambiado a `(date, section_time, section_end_time)` — ahora ítems con misma fecha y hora se consolidan en una sola tanda, sin importar la categoría.
- Items dentro de cada tanda se ordenan por `item_type` (usando `company.proposal_item_types` configurado en Settings) y luego por `sort_order`, así Bebidas aparecen antes que Bocadillos automáticamente.
- `KitchenBEOPrint.js` ahora muestra el header de tanda como `Lun, 25/05/2026 — 08:15` en una sola línea (estilo Ciano). El antiguo `section_title` queda como sub-label opcional para retrocompatibilidad.
- Snapshot hash sigue funcionando (sección de `tanda.section_title` ahora None — incluido en el hash como cadena vacía).

### E-Invoicing Fase 1A — Vault de certificados (Feb 23, 2026)
- **Backend**:
  - `services/efactura/cert_vault.py`: parse PFX/P12, extract X.509 metadata (CN, serial, issuer, fingerprint SHA-256, valid_from/valid_to), envelope encrypt PFX + password con `cryptography.fernet.Fernet`. Master key `EFACTURA_MASTER_KEY` en `backend/.env` (32-byte Fernet, falla rápido si falta).
  - `routers/efactura.py`: `POST /api/efactura/cert/upload` (multipart file + password, role-gated owner/admin/finance), `GET /api/efactura/cert` (metadata only — blob nunca sale del server), `DELETE /api/efactura/cert`.
  - Persistencia en colección nueva `efactura_certificates` keyed por `company_id`.
  - Sincroniza `efactura.config.cert_uploaded_at` con la carga/borrado.
- **Frontend**:
  - Tarjeta de certificado en `EFacturaSection.js` con form de upload + display de metadata + badge de vigencia (verde/ámbar/rojo según días para vencer) + botones Reemplazar/Eliminar.
- **Verificado**: roundtrip cifrar→descifrar→reparsar PFX preserva CN; contraseña errónea devuelve 400; archivo >256KB rechazado; metadata visible sin exponer bytes ni password.
- **Pendiente**: Fase 1B (XML e-CF) + 1C (XMLDSig) + 1D (cliente DGII) bloqueadas hasta tener certificado real de pruebas DGII y XSD oficial.
### E-Invoicing Phase 0 — feature flag + arquitectura (Feb 23, 2026)
- Nuevo módulo "Facturación Electrónica" como add-on opt-in por tenant. Diseñado para crecer multi-país (DGII RD, SAT MX, DIAN CO, SUNAT PE, SII CL, AFIP AR, SRI EC).
- **Backend**:
  - `models/efactura.py`: `EInvoicingConfig`, `EInvoicingConfigUpdate`, `EInvoicingToggleRequest`, `NCFRange`.
  - `services/efactura/providers/base.py`: `EInvoicingProvider` ABC + registry (`register_provider`, `get_provider`). Concrete providers (DGIIProvider, SATProvider, etc.) llegan en Fase 1+.
  - `routers/efactura.py`: factory builder con endpoints `GET/PUT /api/efactura/config`, `POST /api/efactura/test` (placeholder Fase 1), `GET/POST /api/super-admin/companies/{cid}/efactura[/toggle]`.
  - Config se persiste en `companies.industry_config.e_invoicing` (sub-documento).
  - PUT requiere role owner/admin/finance. Toggle requiere super admin.
- **Frontend**:
  - `pages/business-clarity/EFacturaSection.js`: form de configuración (país, ambiente, RNC/RFC/NIT, razón social) + tarjetas placeholder para certificado / emitir e-CF / historial (todas marcadas "Próximamente").
  - Nav item "Facturación Electrónica" en BusinessClarityPage solo visible cuando `e_invoicing.enabled === true` para esa org.
  - Estado "no activado" muestra una tarjeta explicativa con lista de features y CTA a soporte.
- **Verificado por curl**: enable/disable por super-admin, GET/PUT por usuario admin, placeholder /test responde "Fase 1".


### Widget de Motivos de Pérdida (Feb 23, 2026)
- Nuevo endpoint backend: `GET /api/events/lost-reasons-analytics?period=30d|90d|1y|all` — agrega conteos, % y valor estimado por motivo de pérdida; incluye top 5 pérdidas recientes con cliente y fecha.
- Nuevo componente `LostReasonsWidget.js` con gráfico de donut (recharts), desglose por motivo y lista de pérdidas recientes con enlace directo al evento. Colapsable, con selector de periodo. Vacío amigable cuando no hay pérdidas.
- Montado en Client Engagement → Propuestas (`EventsPage.js`) sobre la lista/pipeline. Visible al expandir.


### Marcar Propuestas como Perdidas (Feb 23, 2026)
- Renombrada la etapa "Archived/Archivado" → **"Lost/Perdida"** en la UI (valor interno sigue siendo "Archived" por retrocompatibilidad).
- Nuevo componente `LostReasonDialog.js` con 7 motivos predefinidos: Precio, Tiempo/Fechas, Competencia, No responde, No aplica, Alcance, Otro + notas opcionales (500 chars).
- Al cambiar etapa a "Perdida" en `EventDetails.js` o en el pipeline de `EventsPage.js`, el diálogo se intercepta y captura el motivo.
- Banner gris en `EventDetails.js` muestra el motivo, fecha, notas y botón "Editar" cuando el evento está perdido.
- Backend: nuevos campos `lost_reason_notes` y `lost_reason_at` en el modelo `Event`. PUT `/api/events/{id}` estampa automáticamente `lost_reason_at` al entrar a Archived y limpia los 3 campos cuando se mueve a otra etapa.
- Labels renombrados también en `EngagementCalendar.js` (vistas semana/mes/día y modal).


### Banner Lead Form — Compresión cliente (Feb 23, 2026)
- Nuevo util `/app/frontend/src/utils/imageCompress.js` (canvas resize + reencode iterativo a JPEG/PNG, objetivo ~500KB / 1600px en lado mayor).
- Integrado en `SettingsPage.js` (handler de subida del banner del Lead Form): el archivo se comprime antes de `POST /api/settings/upload-banner`.
- Límite frontend subido a 10MB (auto-optimiza); backend ahora acepta hasta 5MB tras compresión.
- Toast indica los KB ahorrados cuando la compresión surte efecto > 50KB.


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

### Multi-Date (Non-Consecutive) Event Picker (Feb 19, 2026 — follow-up)
**Goal**: Let operators pick **individual non-consecutive dates** for an event (e.g. a weekly course held only on Tuesdays and Thursdays) instead of being forced into a continuous date range.

**Frontend** (`/app/frontend/src/pages/EventsPage.js`, `/app/frontend/src/components/ProposalEditor.js`)
- New **"Días no consecutivos / múltiples fechas"** toggle in the Event Create/Edit dialog (`data-testid="multi-date-toggle"`), shown right below the existing "Date TBD" toggle.
- When enabled, the standard single-date or start/end-range fields are hidden and replaced with:
  - A side-by-side 2-month `<Calendar mode="multiple" />` (uses `react-day-picker` already shipped via shadcn).
  - Chips showing every picked date with × remove buttons (`data-testid="multi-date-chip-N"`) and a "Clear all" link (`data-testid="multi-date-clear"`).
- `handleSubmit` payload derives `event_date` (first picked) and `end_date` (last picked) so legacy components that still read those scalars stay compatible. The full sorted array goes to `event_dates`.
- `handleEdit` re-hydrates `formData.event_dates` from the event's `event_dates` array and toggles `is_multi_select` on automatically when the event already has 2+ dates.
- Event cards in the list show "N fechas · 2026-07-07…" instead of the single date when `event_dates.length > 1`.
- `ProposalEditor.fetchDayLogistics` now **auto-seeds** day-logistics from `event.event_dates` on first proposal open when no manual logistics rows exist — every selected event date becomes a row in the per-date logistics table, so section/item date dropdowns immediately offer those non-consecutive days.

**Backend** — No changes needed; the previous `EventUpdate.event_dates` + sort/dedupe normalization already handles the round-trip. Verified via curl with 4 non-consecutive dates: `["2026-07-07","2026-07-09","2026-07-14","2026-07-16"]` persisted and returned exactly.

**Compatibility**: When `event_dates` is empty the form stays in legacy single/range mode and behaves exactly as before.

### Document PDF Fixes — Order & Logo Size (Feb 19, 2026)
**Bug reports from user**: (1) items printed out of order in proposal PDFs; (2) company logo rendered huge in the printed PDF.

**Root cause**
- `DocumentPreview.groupItems()` iterated `proposal.items` without sorting by `sort_order`. The grouping bucket insertion order ended up dictating output, which usually matched the editor but could drift when items had identical sort_orders or the array was mutated.
- The logo `<img>` only had Tailwind class `h-12` (48px). Tailwind isn't loaded inside the print window opened by `handlePrint()`, so the image fell back to its natural size — which for typical brand logos is 800-2000px wide.

**Fix** (`/app/frontend/src/components/DocumentPreview.js`)
- `groupItems()` now starts with `proposal.items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))` so every section and item lands in the exact order the user arranged with drag/drop or arrow buttons.
- The header logo `<img>` got explicit inline `style` (max-height 56px, max-width 200px, `object-fit: contain`) so the constraint travels with the element into any context.
- The print-window CSS gained a `.doc-logo, .header img { max-height: 56px; max-width: 200px; … }` rule as a belt-and-suspenders safety net for any other img elements in the printed doc.

**Verified**: PDF preview of `prop_e45ef7945072` now shows items in `sort_order` ascending (Entradas → Principales) exactly matching the editor. No regressions for proposals without sections or with a single section.

### Configurable Logo Size in Documents (Feb 19, 2026)
**Goal**: Operators can pick how prominent the company logo should look in printed documents (small for compact invoices, large for branded proposals) without touching code.

**Backend** (`/app/backend/server.py`, `DocumentTemplateCreate`)
- New optional field `logo_size: Optional[str] = "medium"` on `DocumentTemplateCreate` (values: `"small"`, `"medium"`, `"large"`).
- `update_document_template` persists the field with a safe default. Verified round-trip via curl: setting `logo_size="large"` returns `logo_size: large` on subsequent GET.

**Frontend**
- `/app/frontend/src/components/DocumentPreview.js`: the header `<img>` now reads the template's `logo_size` and resolves to `max-height` of 40 / 56 / 80 px (small / medium / large). A `data-logo-size` attribute is mirrored on the element so the print-window CSS can apply the same bound when Tailwind isn't loaded. The print stylesheet was extended with three discrete `.doc-logo[data-logo-size="…"]` rules.
- `/app/frontend/src/pages/SettingsPage.js`: in Settings → Templates, every template card now exposes a "Logo size" (`Tamaño del logo`) `<Select>` directly under the "Show Logo" toggle. The select is hidden when the user disables the logo. Saving fires `handleUpdateTemplate` and shows the "Template updated" toast.

**Tested in preview**: Updated the Proposal template's `logo_size` to "Large (80px)" via the Settings UI, toast confirmed, persistence verified via curl.

### Logo Position Selector (Feb 19, 2026 — follow-up)
**Goal**: Decide where the company logo sits in the document header — left (default), center (banner-style), or right (corporate-style).

**Backend** — `DocumentTemplateCreate` gained `logo_position: Optional[str] = "left"`. The update endpoint persists it with a safe default. Curl round-trip with `{"logo_position":"center"}` returned `logo_position: center` ✅.

**Frontend** (`/app/frontend/src/components/DocumentPreview.js`)
- Lifted the logo `<img>` out of the left header column into its own `.doc-logo-wrap` block above the two-column row so it can be aligned independently without disturbing the company-info / doc-info layout.
- The wrapper sets `display: flex; justifyContent` via inline style **and** mirrors `data-logo-position` so the print-window CSS (3 `.doc-logo-wrap[data-logo-position="…"]` rules) can apply the same alignment when Tailwind isn't loaded.

**Frontend UI** (`/app/frontend/src/pages/SettingsPage.js`)
- Added a "Posición / Position" `<Select>` (Left / Center / Right) next to the Logo Size select. Same hide-when-logo-disabled behavior. data-testid `logo-position-select-<template_id>`.

**Verified**: Both selects render side-by-side in Settings → Templates and persist correctly through `PUT /api/settings/document-templates/{id}`.

### Template Tagline + Persistence Hardening (Feb 19, 2026)
**Goal**: Per-template short slogan that renders directly under the company logo in every printed document (e.g. "Crafting unforgettable events").

**Backend** — `DocumentTemplateCreate.tagline_en` / `tagline_es` (`Optional[str]`). Persisted in both `create_document_template` and `update_document_template`. Curl round-trip verified ✅.

**Frontend** (`/app/frontend/src/components/DocumentPreview.js`)
- New `<p class="doc-tagline">` rendered immediately below the logo wrapper. Picks `tagline_es` or `tagline_en` based on the current language with sensible fallback. Reuses `logo_position` to align the tagline so it sits naturally under the logo (left/center/right).
- Inline `textAlign` + `data-logo-position` mirroring so the print window honors the alignment without Tailwind.

**Frontend UI** (`/app/frontend/src/pages/SettingsPage.js`)
- Added two `<Input>` fields **Tagline (EN)** and **Tagline (ES)** in the Header/Footer grid of every template card with helper text "Shown directly under the document logo". data-testids `tagline-en-input-<template_id>` / `tagline-es-input-<template_id>`.
- **Persistence bug fix**: `handleUpdateTemplate` previously sent only ~10 fields in the PUT body, which meant **any field not explicitly listed (logo_size, logo_position, show_logo, show_tax_id, etc.) was silently reset to its default on every save**. Replaced the payload with the full list of editable fields so toggles and selects added in this session and earlier ones actually round-trip through the UI.

**Verified**: Tagline inputs accept text, save fires "Template updated" toast, value reloads from backend on page refresh. Curl confirmed both EN/ES strings stored. The persistence-hardening fix also rescues `logo_size` / `logo_position` / address & tax-id toggles from accidental resets.

### Deep-Copy Event Duplication (Feb 19, 2026)
**Bug report**: "When I duplicate a proposal, only the name is duplicated — items, sections, etc. are lost."

**Root cause**: `POST /api/events/{id}/duplicate` only cloned the `events` document. It never touched the `proposals` collection or `order_items` collection that hang off the event, so the copied event landed with an empty proposal.

**Fix** (`/app/backend/server.py` — `duplicate_event`)
- After cloning the event we now:
  1. Find the original proposal for the source event and create a new proposal document with fresh `proposal_id` + `proposal_number`, status reset to `Draft`, `sent_at` / `accepted_at` / `rejected_at` cleared, and all other fields (financial totals, day_logistics, custom_field_values, terms, etc.) preserved.
  2. Find every `order_items` row linked to the original proposal, regenerate `item_id`, retarget `proposal_id` + `event_id`, refresh timestamps, and bulk-insert via `insert_many`. Sort order, sections, allergens, pricing, discounts, long descriptions, and recipe/menu references all survive.
- `_id` is stripped before reuse to avoid MongoDB duplicate-key errors.

**Verified**: Duplicated `event_42ccd0133529` (PROP-2026-0027 with 4 items across "Entradas" and "Principales"). The new event got proposal PROP-2026-0028 (Draft) with the same 4 items, preserving sort_order (0,1,1000,1001) and section grouping. Mutating an item in the copy left the original untouched (no shared `_id`).

### PDF Items Ordered by Configured item_type (Feb 19, 2026)
**Bug report**: "Items in the proposal PDF don't come out in the same item_type order I see in the editor."

**Root cause**: `DocumentPreview.groupItems()` sorted items only by `sort_order` globally. The editor groups items by `item_type` (Food → Service → Rental → Fee, in the order configured in Settings → Catalogs → Item Types), which produced a visual mismatch when items of different types had overlapping `sort_order` values (e.g., a freshly-added Service item with `sort_order=0` rendered before a Food item with `sort_order=1`).

**Fix** (`/app/frontend/src/components/DocumentPreview.js`)
- Built a `typeOrder` map from `company.proposal_item_types` (already returned by `GET /api/settings/company`).
- Updated the items sort to `(typeOrdinal(item.item_type), sort_order)` so the PDF mirrors the editor's tab order exactly. Items whose `item_type` is missing or has been deleted from settings sort to the end (`999`) while preserving relative `sort_order`.

**Verified in preview**: A test proposal with 4 Food items, 1 Service item, and 1 Rental item now renders in the exact configured order — Entradas → Principales (Food) → Staff (Service) → Mobiliario (Rental) — independent of individual `sort_order` values. Subtotals already use insertion order so they automatically reflect the same ordering.

### Drag-Reorder for Proposal Item Types (Feb 19, 2026 — follow-up)
**Goal**: Let users reorder the Proposal Item Types (Food / Service / Rental / Fee / custom types) by dragging in Settings → Company → Templates → Proposal Item Types, since the PDF now respects this configured order.

**Frontend** (`/app/frontend/src/pages/SettingsPage.js`)
- New `SortableItemTypeRow` component using `@dnd-kit/sortable` + `useSortable`. Drag attributes/listeners are exposed via render-prop and attached to a `GripVertical` button placed at the start of each row (data-testid `item-type-drag-<type_key>`).
- The list is wrapped in `DndContext` + `SortableContext` using each row's `type_key` as the sortable id.
- `onDragEnd` uses `arrayMove` to compute the new ordering and rewrites `sort_order` for every entry sequentially. State is updated via `setCompany` so the existing "Save Item Types" button persists the change through the standard company-settings save flow.
- A dedicated `PointerSensor` with `activationConstraint: { distance: 6 }` prevents accidental drags when clicking the handle.

**Verified in preview**: Dragged "Food" (idx 0) past "Rental" (idx 2) — order shifted to Service → Rental → Food → Fee instantly. Save button persists the new `sort_order` array, which `DocumentPreview` reads to drive the PDF output.

### Item-Type ↑ ↓ Arrow Buttons (Feb 19, 2026 — follow-up)
**Goal**: Same mobile/keyboard-friendly fallback we added for proposal sections, now for the Proposal Item Types list.

**Frontend** (`/app/frontend/src/pages/SettingsPage.js`)
- Each Item Type row now has small **ArrowUp / ArrowDown** buttons directly after the drag handle.
- First row's ↑ and last row's ↓ render `disabled` with reduced opacity (`disabled:opacity-30`).
- Both arrows call the same `arrayMove` + `sort_order` re-stamp logic used by `onDragEnd`, then update `setCompany` so the existing "Save Item Types" button persists.
- data-testids: `item-type-up-<type_key>` / `item-type-down-<type_key>`.

**Smoke-tested**: Clicked ↑ on Fee → order shifted from `[Food, Service, Rental, Fee]` to `[Food, Service, Fee, Rental]`. ↑ on Food correctly disabled at first position.

### Print Tab Stays Blank — Fixed (Feb 19, 2026)
**Bug report**: "When the PDF opens in another tab it stays blank."

**Root cause**: `handlePrint()` in `DocumentPreview.js` called `printWindow.print()` synchronously right after `document.write()` + `document.close()`. In Safari/Firefox the print dialog opened before the document was committed/painted, and once the user dismissed the dialog the new tab was left blank. There was also no null check on `window.open`, so popup-blocked browsers crashed silently.

**Fix** (`/app/frontend/src/components/DocumentPreview.js` → `handlePrint`)
- Bail out early with a Spanish/English toast when `window.open(...)` returns `null` (popup blocked).
- Added a proper `<!DOCTYPE html>` + `<meta charset="utf-8" />` to the written document so browsers don't render in quirks mode.
- Defer `printWindow.print()` until **after** the new tab paints: attach `printWindow.onload` and call `print()` inside a 50 ms `setTimeout` so layout/image-decode have a frame to settle. Belt-and-suspenders: a 500 ms `setTimeout` fallback fires the print only if `onload` never does (Safari + `about:blank` quirk).
- Wrap the `print()` call in try/catch so a closed tab doesn't throw.

**Verified**: Print popup from `prop_e45ef7945072` Proposal/Contract now opens with title `"Proposal / Contract - Reorder Test Event"`, 1 image, 6 table rows, and 772 chars of body text — no longer blank when the print dialog is dismissed.

### Print Now Uses a Hidden Iframe (no popup) + Subtotal Labels Localized (Feb 19, 2026)
**Two issues batched together:**

**A) Popups blocked / blank tabs**: Even with the load-aware fix, popup blockers and mobile Safari kept stranding users. Replaced `window.open` with a hidden `<iframe>` that lives on the same page.

**B) "Resumen por Tipo" still showed raw English keys** (`Food`, `Service`, `Rental`, `Fee`) even when the document language was Spanish.

**Fix** (`/app/frontend/src/components/DocumentPreview.js`)
- `handlePrint()` no longer calls `window.open`. It creates a hidden iframe (`position:fixed; right/bottom 0; w/h 0; visibility:hidden`), injects the same HTML via `iframe.srcdoc` (fallback to `document.write`), waits for `onload` (50 ms grace) and a 700 ms safety timer, then calls `iframe.contentWindow.print()`. The iframe is removed 800 ms later so the print dialog stays attached during preview.
- Subtotals block now resolves each `type_key` to its `label_en` / `label_es` via `company.proposal_item_types`. Falls back to the raw key only when the type was deleted from settings. Fully localized: ES → "Alimentos y Bebidas (4 ítems)", EN → "Food & Beverages (4 items)".

**Verified in preview**:
- Pages before print: 1 → after print: 1 (no new tab) ✅
- Iframes on page after print: 0 (cleanup ran) ✅
- Subtotals rendered `Food & Beverages (4 items)`, `Services & Staff (2 items)`, `Rentals & Equipment (5 items)` instead of raw keys ✅

### PDF Visual Parity with Screen (Feb 19, 2026)
**Bug report (with reference PDF)**: "El PDF se ve feo, quiero que se vea como se ve en el sistema." Analysis showed the exported PDF looked like raw unstyled HTML — no table borders, no padding, missing visual hierarchy, raw English type_keys in subtotals, plus the browser's `about:srcdoc` + timestamp artifacts in the printed footer.

**Root cause**: The iframe used for printing had a minimal `<style>` block (~30 lines). Tailwind utility classes from the React tree weren't honored, so tables rendered as naked HTML and section banners disappeared. The browser also auto-injected the source URL and the current date/time into the printed header/footer because no `@page` margin rules were declared.

**Fix** (`/app/frontend/src/components/DocumentPreview.js` → print stylesheet)
- Rewrote the print stylesheet (~120 lines) to fully replicate what the user sees on screen:
  - Branded `h1` / `h2` / `h3` / `h4` typography with proper weight + color.
  - Table styling: header bar in `primaryColor` with white text, 8/10 px cell padding, 1 px bottom borders, zebra rows (`#fafafa` on even).
  - Section title bars with a left-border accent in the primary color and tinted background.
  - Box treatments for Notes (amber), Terms (gray), Payment Info (mint), Bank Details (blue monospace), Subtotals (gray).
  - Logo bounds + alignment (already shipped) merged into the same stylesheet.
  - Fallback rules for the Tailwind utility classes the React tree relies on (`text-muted-foreground`, `font-medium`, `space-y-*`, `gap-*`, `rounded-lg`, `bg-muted/*`).
- Added `@page { margin: 14mm 12mm; size: auto; }` plus `@media print` rules to keep rows from breaking across pages (`page-break-inside: avoid`) and ensure table headers repeat (`thead { display: table-header-group; }`). The `@page` rule also removes the browser-injected URL/date artifacts in modern browsers.

**Verified in preview**: Print iframe of `prop_e45ef7945072` now renders a polished proposal with branded tables, section banners, info grid, and tagline — visually indistinguishable from the on-screen preview.

### Timezone Date Offset — Full Sweep (Feb 19, 2026)
**Bug report**: "I set May 20 in the event but it shows May 21. Same with non-consecutive days."

**Root cause** (two bugs combined):
1. **`utils/dates.js → toDateOnly`** used `new Date(value).getFullYear/Month/Date()` for string input. When the value was an ISO string with UTC midnight (`"2026-05-20T00:00:00Z"`, the backend's storage format), `new Date()` shifted it to the previous day in any UTC-X timezone and `getFullYear` returned that shifted local date. So `"2026-05-20T00:00:00Z"` round-tripped to `"2026-05-19"` (UTC-5) or `"2026-05-21"` (UTC+1).
2. **15+ call-sites** still used `new Date(event.event_date).toLocaleDateString(...)` directly instead of the safe helpers, so even with the helper fixed those screens kept showing the wrong day.

**Fix**
- **`/app/frontend/src/utils/dates.js`** → `toDateOnly` now extracts the calendar date directly from any string that starts with `YYYY-MM-DD` (regardless of trailing time/UTC), bypassing `new Date()` entirely. Falls back to local-Date extraction only for genuine `Date` instances. Verified with Node test: `toDateOnly("2026-05-20T00:00:00Z")` → `"2026-05-20"` in every timezone.
- **Replaced `new Date(...).toLocaleDateString()`** with `formatDateOnly(...)` (and `new Date(...)` with `parseDateOnly(...)` for duration math) across all user-facing event displays:
  - `EventsPage.js` (card display + getDuration)
  - `EventDetails.js` (getDuration)
  - `Dashboard.js` (activeEvents map, upcoming-without-team filter, event card)
  - `EventOrchestrationPage.js` (time-window filter, two date displays)
  - `CRMPage.js` (lead list + lead detail)
  - `ClientDetails.js`, `ClientEventPortal.js`, `ClientPortal.js`, `ClientPortalMain.js`
  - `DocumentPreview.js` page + component (event_date display in header, section date headers, formatDate helper)
  - `EngagementCalendar.js` (3 spots — month-jump filter, multi-day display, selected-event dialog)
  - `Partners/PartnerDetailPage.js` (event card)
  - `FoodOpsPage.js` (event selector)

**Verified in preview** with Node round-trip test:
- `"2026-05-20T00:00:00Z"` → `"2026-05-20"` ✅
- `"2026-05-20"` → `"2026-05-20"` ✅
- `new Date(2026, 4, 20, 12, 0, 0)` → `"2026-05-20"` ✅

### Live Proposal Total on Event Card (Feb 20, 2026)
**Bug report**: "I duplicated a proposal, then deleted items inside the copy, but the amount on the card outside still shows the original total. Verify that the amount is updating with what's inside."

**Root cause**: The event card reads `event.expected_value`, a stored field on the `events` document. Two issues compounded:
1. The proposal item endpoints (`POST/PUT/DELETE /api/proposals/{id}/items`) never recompute `proposal.total_amount`, so any cached aggregate goes stale the moment items are added/removed.
2. `duplicate_event` cloned the original's `expected_value` verbatim. Combined with #1, the card on the duplicated event kept showing the original's amount forever — even after deleting every item.

**Fix** (`/app/backend/server.py`)
- Both `GET /api/events` and `GET /api/events/pipeline` now compute `expected_value` **on the fly** via an aggregation over `order_items` per event_id:
  - `$cond` picks `total_price` when present, otherwise falls back to `quantity * unit_price`.
  - `$group` by `event_id` sums the line totals.
- Cross-check against `proposals.find({event_id: {$in: …}})` to know which events actually have a proposal. For those:
  - Override `expected_value` with the live computed total (or **0** if all items have been deleted — the previous behavior swallowed the empty-proposal case).
- Events without a proposal keep their manually-entered `expected_value` untouched (CRM lead estimates etc.).

**Verified in preview** with `Reorder Test Event` and `Reorder Test Event (Copy)`:
- After duplication with 4 items each → original **$285**, copy reflects copy's items.
- After deleting **all** items in the copy → original stays **$285**, copy shows **$0** ✅. The cards now move independently with their own contents.

### Section Replication & "All Days" Item Fan-Out (Feb 20, 2026)
**Bug reports**:
1. "When I have a multi-day proposal and add sections, the section overwrites every item's date with a single section date. I can't have a 'Bocadillos' section with one entry per day."
2. "When I add an item and pick 'All days', it doesn't duplicate per day — only one row stays."

**Root cause**:
1. The section header rendered a single `<Select>` bound to `handleSectionDateChange`, which fired a bulk PUT setting **every** item in the section to the same date — so individual per-item dates were impossible to keep.
2. `handleAddItem` did one POST regardless of how many days the proposal spanned, so "All days" (`event_date=""`) created exactly one undated row.
3. The "All days" select was also gated on `event.event_date !== event.end_date`, missing the new non-consecutive `event_dates` and the `dayLogistics`-driven path entirely.

**Fix** (`/app/frontend/src/components/ProposalEditor.js`)
- **Section header**: replaced the destructive `<Select>` with **read-only date chips** that summarize every distinct `event_date` appearing in the section's items (`section-date-chips-<title>` testid). The selector that auto-overwrote dates is gone.
- **New "Replicate across days" button** (`section-replicate-<title>` testid): when a section spans fewer days than the proposal, the header shows a small `+N days` button. Clicking clones every item in the section once per missing date, preserving qty/price/long_description/discounts. Toast: "Sección replicada en N día(s)".
- **Item fan-out** in `handleAddItem`: when the user picks "Todos los días" (`event_date===""`) in a multi-day proposal, the handler now POSTs N independent items in parallel (`Promise.all`), one per date in `dayLogistics` (or `event_dates` / range fallback). Each row stays editable on its own.
- **"All days" selector** rebuilt: now uses `dayLogistics` as the source of truth (works for non-consecutive `event_dates` and legacy ranges alike) and labels the option `"Todos los días (N)"`. Helper text under the select reads `'"Todos los días" duplica el ítem una vez por día'`.

**Verified in preview**: `Bocadillos` section with 2 items dated Aug 1 in a 3-day event (Aug 1, 3, 5):
- Header showed the chip `Aug 1` plus `+2 days` button.
- Click → toast confirmed, header chips became `Aug 1` `Aug 3` `Aug 5`, item count rose 8→12, section total $220→$660 ✅.

Next: Eliminate ProposalEditor.js bloat (now ~4360 lines) by extracting Sortable wrappers and dialogs; finish UX Workstreams A/B/C; Logo Guest Flow; Unified Contact Model.


### Item Types Order Parity (Settings ↔ Proposal Editor) — Feb 20, 2026
**Reported**: "Los tipos de items salen distintos en settings y en las propuestas". The grouped picklist inside the **Add Item** dialog (Bocadillos / Servicios / Alquileres / Cargos) was rendering in a fixed, hardcoded order regardless of how the user reordered the types in `Settings → Catálogos → Tipos de Ítems`, and was using its own hardcoded ES/EN label map.

**Root cause** (`/app/frontend/src/components/ProposalEditor.js`, picklist block around L3530):
```js
// stale code
const map = language === "es"
  ? { Food: "Bocadillos & Alimentos", Service: "Servicios", Rental: "Alquileres", Fee: "Cargos", Other: "Otros" }
  : { Food: "Food & Snacks", Service: "Services", Rental: "Rentals", Fee: "Fees", Other: "Other" };
const order = ["Food", "Service", "Rental", "Fee", "Other"];
```
This bypassed the user's customized `company.proposal_item_types` order entirely.

**Fix**
- Picklist `sortedKeys` now derives from the shared `ITEM_TYPES` array (already built from `company.proposal_item_types` honoring `sort_order` and `is_active`).
- Group label now comes from `getItemTypeLabel(k)` (the same helper used by the main section render and the item edit dialog), so renamed types (e.g. `Food` → `Alimentos y Bebidas`) propagate everywhere.
- Any legacy keys present in picklist data but missing from settings (e.g., `Other`) are appended after the configured order so nothing disappears.

**Already correct** (verified during the fix):
- Section grouping render (`ITEM_TYPES.map(...)` ~L2138) — uses settings order.
- Add/Edit item `<Select>` for `item_type` (~L3623) — uses settings order.
- PDF print (`DocumentPreview.js`) — already sorted by `proposal_item_types` ordinal.

Outcome: the Add-Item picklist, the editor section groups, the edit-item type selector, and the printed PDF all consume the same single source of truth (`company.proposal_item_types`).


### Calendar Service-Level Granularity + Week Timeline — Feb 20, 2026
**Reported**: "Cuando agrego varios servicios en diferentes horarios en la propuesta no me salen en el calendario… por ejemplo si una propuesta tiene un desayuno a las 8 y almuerzo a las 12 que salga." Calendar only showed a single block per event/day, ignoring proposal sections, section times, and multi-day `event_dates`.

**Backend** (`/api/orchestration/calendar`, server.py L15185):
- Rewrote the endpoint to compute `calendar_dates` per event (union of `event_date`, `end_date` range, and `event_dates`).
- Window filter is now overlap-based (any date in `calendar_dates` ∈ [start, end]) instead of equality on `event_date`.
- Loads each event's proposal `order_items`, groups them by `(event_id, event_date, section_title, section_time)` and returns a `services` array per event: `{date, time, end_time, title, item_count, item_types, total}` sorted by date+time.
- Undated services (no `event_date` on the item) fall back to the event's first calendar date so they still surface.
- Conflicts now derived from `calendar_dates` (so multi-day overlaps are detected).

**Frontend** (`/app/frontend/src/components/orchestration/EventCalendarTab.js`, full rewrite):
- New view toggle: **Mes** (default) / **Semana** (`calendar-view-month` / `calendar-view-week`).
- **Mes**: each day cell now lists time-prefixed service chips (`08:00 Desayuno`) instead of a single event pill — events without services still show as a stage-colored pill. Multi-day events appear on every day in their range.
- **Semana**: Sunday-start 7-column timeline with hour rows 07:00–22:00 (56px each). Each timed service is a positioned colored block using `section_time` as top offset and `section_end_time` (or default 1h) as height. An all-day strip at the top renders services without a time. Services outside the visible 07–22 window collapse into ↑ / ↓ overflow chips at the day column edges.
- Side panel now includes a **Servicios** subsection enumerating each service (time, title, date).
- All date math uses local-tz `toLocalISO` to avoid the previous UTC shift bug.

**Test data seeded** for verification (company `company_3ab116c0994d` / demo.agency@kora.com):
- `event_test_timed_services` (Servicio Multi-Horario Test) on 2026-05-20 with `prop_test_timed_services` and 5 order_items in 3 sections — Desayuno 08:00→10:00, Almuerzo 12:00→14:00, Coffee Break PM 16:00→17:00.

**Validation** (`/app/test_reports/iteration_178.json` — testing_agent_v3_fork, 100% pass):
- Backend pytest: 4/4 — calendar_dates populated, multi-day expansion (Reorder Test Event 08-01/03/05), services returned with correct times, conflicts still detected.
- Frontend: Month view shows the 3 time-prefixed chips on the correct day. Week view renders the 3 positioned blocks with their times. Clicking a service block opens the details side panel with the Services subsection.


### Drag-to-Reschedule on Week Timeline — Feb 20, 2026
**Goal**: Let the user move a service slot to a new start time (or different day) by dragging its block in the Week view of the orchestration calendar.

**Backend** (`/app/backend/server.py`, near `orchestration_router`):
- New endpoint `POST /api/orchestration/calendar/reschedule-service`.
- Body: `{event_id, section_title, event_date, old_time, new_time, new_end_time?, new_date?}`.
- Finds the proposal of the event, then `update_many` on `order_items` matching `(proposal_id, $or date clauses, $or section_title clauses, $or section_time clauses)` — permissive enough to handle legacy items where `event_date` is stored as a full ISO timestamp.
- Returns `{matched, modified, new_time, new_end_time, new_date}`.
- Guards: 400 missing `event_id`, 404 unknown event / no proposal, 400 when event is `Closed`.

**Frontend** (`EventCalendarTab.js`):
- `handleRescheduleService` callback POSTs the change and refetches the calendar, surfacing a sonner toast `"Servicio reagendado a HH:MM…"`.
- `WeekTimelineView` blocks are now `draggable` with `cursor-grab` — `onDragStart` serializes the entry and the mouse offset; `onDrop` on the target day column computes the new start time snapped to 15-min increments, preserves the original duration when computing `new_end_time`, and triggers the callback.
- Cross-day drops switch `event_date` automatically.

**Validation** (`/app/test_reports/iteration_179.json` — testing_agent_v3_fork, 100% pass):
- Backend pytest 5/5: move Desayuno 08:00→10:30 (`matched=2/modified=2`), cross-day move, 400/404 guards, revert OK.
- Frontend: dragging the Desayuno block down ~2.5 rows fired the dragstart→drop pipeline, a toast appeared, block re-rendered at the new time, and a follow-up GET confirmed the section_time was persisted with the other two services unchanged.


### PDF Proposal — Blank Bottom-Half Page Fix — Feb 20, 2026
**Reported**: "Mira como me salen las propuestas con una pagina entera vacía" (Magnolia.pdf attached). Analysis of the PDF showed page 1 contained only the header + "Resumen de Catering" (1 row table) and then **~70% of the page was empty whitespace**, while all the actual service sections jumped to page 2.

**Root cause** (`/app/frontend/src/components/DocumentPreview.js`):
The print stylesheet declared `tr, .date-group, .notes, .terms, .payment-info { page-break-inside: avoid; }`. Each `.date-group` wraps an entire day's services (multiple `.category-section` tables). When the first day didn't fit in the space remaining after the catering summary, the browser honored `page-break-inside: avoid` and pushed the **entire day-block** to the next page, leaving page 1 mostly empty.

**Fix**:
- Removed `.date-group` from the `page-break-inside: avoid` list.
- Added `.category-section` (each individual service) as the keep-together unit — small enough to fit on a page, big enough to look intentional.
- Added `page-break-after: avoid` to `.date-title`, `.section-title`, and `h4` so section headers stay attached to their first content row.
- Added the modern `break-inside / break-after` aliases alongside the legacy `page-break-*` properties for Chrome/WebKit compatibility.

Now content flows: header → catering summary → first service section fills the rest of page 1 → subsequent sections continue on page 2 — no big gaps.


### Settings → Templates → PDF Density Selector — Feb 20, 2026
**Goal**: Tune PDF spacing per template so long proposals fit on fewer pages and short ones look elegant — no code changes needed per proposal.

**Backend** (`/app/backend/server.py`):
- Added `pdf_density: Optional[str] = "normal"` to `DocumentTemplateCreate` (values: `compact | normal | spacious`).
- `PUT /api/settings/document-templates/{id}` persists `pdf_density` and echoes it back. Stored on `db.document_templates`.

**Frontend Settings** (`SettingsPage.js`):
- New `<Select>` next to "Posición" in the Proposal/Quote template editor: data-testid `pdf-density-select-{template_id}`. Spanish labels Compacta / Normal / Espaciada.
- `handleUpdateTemplate` forwards `pdf_density` in the PUT payload.

**Frontend Print** (`DocumentPreview.js`):
- New `density` object computed from `template.pdf_density` controls: base font size (11 / 13 / 14 px), line height (1.35 / 1.5 / 1.7), section gap-top (12 / 18 / 26 px), section gap-bottom (4 / 8 / 12 px), table cell padding (4×8 / 8×12 / 12×16 px), and `@page` margin (10mm / 14mm / 18mm).
- Density vars are interpolated into the injected `<style>` block of the print iframe; consumed by `table`, `.section-title / .date-group`, `.notes / .terms / .payment-info`, and `@page`.

**Validated**: backend curl round-trips `compact` / `normal` / `spacious` correctly.


### Orphan Item Types — Visible in Editor, Counted Correctly in PDF — Feb 20, 2026
**Reported**: "Algunos items que me salen cuando imprimo el documento pero no en edición." Sample PDFs (ONAPI, PROP-2026-0019) showed an extra section "Bebidas sin Alcohol — Jugo Fruit Punch (Galón) RD$18,720" in the printed PDF that was completely hidden from the proposal editor. Editor badge said "Ítems (16)" but only 15 visible.

**Root cause**:
- `ProposalEditor.js` built its `ITEM_TYPES` array exclusively from `company.proposal_item_types` (the 4 configured types). Then it iterated those types to render each group — meaning items whose `item_type` was *not* in that list (e.g., a legacy "Other", "Bebida", or anything created/imported with a non-standard tag) silently disappeared from the editor.
- `DocumentPreview.js` does not filter by configured types, so those items reappeared in the printed PDF — causing the "ghost item" discrepancy.
- Secondary: `calculateSubtotals` summed `item.quantity` for the count (showed "Alimentos y Bebidas (336 ítems)" — actually quantities, not item count).

**Fix** (`/app/frontend/src/components/ProposalEditor.js`):
- After building `ITEM_TYPES` from `proposal_item_types`, append any *additional* `item_type` values present in `proposal.items` that are not configured. Build a parallel `ORPHAN_TYPES` Set.
- In the group `CardTitle`, when `ORPHAN_TYPES.has(itype)` is true, render an amber `Tipo no configurado` badge (`data-testid='orphan-type-warning-{type}'`) with a tooltip explaining the situation.

**Fix** (`/app/frontend/src/components/DocumentPreview.js`):
- `calculateSubtotals` now `subtotals[type].count += 1` instead of `+= item.quantity`. Resumen por Tipo now reports actual item counts.

**Validation** (`/app/test_reports/iteration_180.json` — testing_agent_v3_fork, 100% pass):
- Seeded an `item_type:'Bebida'` item on a demo proposal → editor surfaced a new "Bebida" group with the warning badge; the total items count matched the badge in the header.
- DocumentPreview Summary by Type showed `Bebida (1 items)` — correct count instead of `(13 items)` (quantity).
- After cleanup the orphan was deleted via the existing DELETE endpoint.


### Orphan Item Types v2 — Empty/Null item_type Coverage — Feb 20, 2026
**Reported (follow-up)**: After redeploy to production the user said "todavía no me salen los jugos en el editor". v1 only synthesized orphan groups for items whose `item_type` was a non-empty, non-configured string. Items where `item_type` was literally `""`, `null`, or `undefined` still slipped through — and the production juice items had exactly that shape (PDF falls back to "Other" but the field was empty in the DB).

**Fix v2** (`/app/frontend/src/components/ProposalEditor.js`):
- `ITEM_TYPES` IIFE: while scanning `proposal.items`, set a `hasUntyped` flag whenever an item has `(item_type || "").trim() === ""`. After the loop, if `hasUntyped` and `"Other"` isn't already configured, append `"Other"` to the list.
- `ORPHAN_TYPES` mirrors the same logic so the amber "Tipo no configurado" badge appears on the synthetic Other bucket too.
- `getItemTypeLabel("Other")` returns "Otros (sin tipo)" / "Other (untyped)" when not configured.
- The grouping filter in `itemsByType` now matches both `""` and the literal `"Other"` under the `Other` bucket: `if (itype === "Other") return raw === "" || raw === "Other"`.

**Validation** (`/app/test_reports/iteration_181.json` — 100% pass):
- Seeded 3 orphans on a demo proposal: `item_type = "" / null / "Bebida"`.
- Editor renders both a `Bebida` group and a synthetic `Other (untyped)` group, each with the amber badge. Header pill shows `Items (3)`. Standard types (when present) remain badge-free.
- Cleanup removed all 3 seeded items.


### Print Button Regression (Safari + ALL browsers) — Feb 20, 2026
**Reported (production)**: "Ahora cuando le doy a imprimir la cotización el botón no funciona" — Safari, production (`ourkora.com`).

**Real root cause** (discovered by testing agent, iteration 182):
The page-break CSS fix earlier in the day introduced a CSS comment inside the `html` template literal that wrapped `.date-group` in backticks. The un-escaped backticks closed the surrounding JS template literal mid-string. Babel/webpack accepted it; the resulting bundle evaluated `.date-group` as `.date - group` (subtraction). At click time, `handlePrint` threw `ReferenceError: group is not defined` BEFORE `win.print()` could run. Print silently died in every browser — Safari was just the first user to notice.

**Fix** (`/app/frontend/src/components/DocumentPreview.js` L573-575): removed the inline backticks from the CSS comment.

**Bonus refactor** (same iteration): rewrote `handlePrint` to be fully synchronous within the click handler — `doc.open/write/close` then immediate `win.print()` — so the print dialog stays inside the user-gesture stack on Safari.

**Validation** (`/app/test_reports/iteration_182.json` — 100% pass after fix): clicking Imprimir injects the aria-hidden iframe, calls `win.print()` exactly once, no console errors, iframe cleaned up after ~1.2s. Cerrar still closes the modal.

**Lesson**: never put un-escaped backticks inside a template-literal html string, even in comments.


### Super-Admin: Per-Company Limit Overrides + Plan Limit Editor + Orphan Member Repair — Feb 20, 2026

**Requests** (Margaret): (1) some companies hit a 50-events ceiling — let me lift it for individuals or globally; (2) when I open a company the users tab is empty even though those users exist and can log in.

**Backend** (`/app/backend/server.py`):
- **Issue 1a — per-company overrides**:
  - Added `companies.limit_overrides: dict` (no schema migration needed; absent = use plan).
  - `PUT /api/super-admin/organizations/{company_id}/limit-overrides` accepts `{events_per_month, active_users, supplier_invoices_per_month, proposals_per_month, storage_mb, execution_goals_per_month}`. `null` for any key removes that override.
  - `check_usage_limit` now reads the company override first, then the plan default. Returns the effective limit either way.
  - `GET /api/super-admin/organizations/{company_id}` echoes `limit_overrides` in the response.
- **Issue 1c — global plan limits**:
  - `GET /api/super-admin/plans` lists all plans.
  - `PUT /api/super-admin/plans/{plan_id}` patches `limits` and/or `features` dicts only (price/name remain immutable here).
- **Issue 2 — orphan members**:
  - `get_org_members` now merges `memberships` + any `users` with `users.company_id == org` that aren't already covered. Adds `has_membership` flag.
  - `POST /api/super-admin/organizations/{company_id}/members/from-user/{user_id}` creates the missing `memberships` row (idempotent — returns `created:false` on retry).

**Frontend**:
- `OrganizationDetailPage.js`:
  - New **LimitOverridesCard** in Overview tab — one input per metric with the plan default shown as placeholder ("Plan: 30"). Buttons: Guardar / Sin límites (999999 for all) / Limpiar todo (drop all overrides).
  - Members table: rows with `has_membership=false` show an amber **"Sin membresía"** badge and a **"Crear membresía"** action (sets role=`viewer`).
- `SuperAdminSettings.js`: new **Planes** tab → `PlansEditor` renders one card per plan with 6 limit inputs + Save.

**Validation** (`/app/test_reports/iteration_183.json` — 100% pass):
- Backend pytest 6/6 — orphan merge, idempotent create, set/clear override, plan list/patch (limits-only), `check_usage_limit` honors override.
- Frontend: override saved on demo company → persisted across reload → cleared OK. plan_starter `events_per_month` changed to 75 → persisted → reverted to 50.
- Backend test file at `/app/backend/tests/test_super_admin_limit_overrides_plans.py` (idempotent — snapshots and restores).

**Note for Margaret**: `plan_starter` ships with `events_per_month: 50` (the "máximo 50" she was seeing). She can now either (a) bump only her specific customer via the override card, or (b) raise the global Starter ceiling from `Super-admin → Settings → Planes`.


### Super-Admin: Usage Alerts Bell (≥80%) — Feb 20, 2026

**Goal**: surface companies approaching their plan/override limits so Margaret can lift caps proactively instead of waiting for complaints.

**Backend** (`/app/backend/server.py` — new endpoint near L18247):
- `GET /api/super-admin/usage-alerts?threshold=80` iterates every active/trialing subscription, loads the company's current `usage_meters` row for the period, then for each of the 5 metered fields (events_created → events_per_month, active_users, supplier_invoices, proposals_created, storage_mb) computes the effective limit = `company.limit_overrides[field] ?? plan.limits[field]`, and emits an alert when `current/limit ≥ threshold%`.
- Response: `{threshold, period, total, companies_count, alerts: [{company_id, name, metric, label, current, limit, percentage, source: override|plan, plan_id, subscription_status}]}` sorted by `percentage` desc.

**Frontend**:
- `UsageAlertsBell.js` (new): bell icon with red count badge. Polls `/usage-alerts` every 60s; **pauses polling on `visibilitychange === hidden`** to save load when admin tabs are backgrounded. Popover groups alerts per company (hottest metric on top, secondary metrics counted as `+N más`), color-coded progress bars (red ≥100%, orange ≥95%, amber otherwise). Click → `/super-admin/organizations/{id}?focus=limits`.
- `SuperAdminLayout.js`: imports the bell and mounts it absolute top-right of the `<Outlet>` container so it's visible on every super-admin page.
- `OrganizationDetailPage.js`: reads `?focus=limits`, switches to Overview tab, scrolls `[data-testid="limit-overrides-card"]` into view and adds an amber ring (`ring-2 ring-amber-400 ring-offset-2`) that fades after 2.4s. A `useRef` guard prevents the effect from re-firing when `org` is refetched after a save.

**Validation** (`/app/test_reports/iteration_184.json` — 100% pass):
- Backend pytest 7/7 — envelope shape, threshold filter (0 / 80 / 200), override suppresses an alert correctly, only active/trialing subscriptions appear, 401 enforced.
- Frontend: bell renders with "2" badge on the demo seed (Kora OS Test 100%, Creative Agency Demo 80%). Popover opens, X / outside-click close it correctly. Clicking a row navigates, focuses, and removes the ring after 2.6s. Regression on 3 other super-admin routes passes.
- Test file: `/app/backend/tests/test_super_admin_usage_alerts.py` (idempotent, restores any overrides it touched).


### Kitchen BEO v2 — Per Tanda + Multi-Day + Print Tracking + Batch + PDF=Preview — Feb 20, 2026

**Requests** (Margaret): (1) hojas de cocina divididas por tanda de servicio + por día; (2a) batch print por rango de fecha; (2b) última impresión + alerta si hubo cambios; (3) PDF guardado pixel-perfect al preview.

**Backend** (`/app/backend/server.py`, kitchen_beo_router L4137-L4500):
- `GET /api/kitchen-beo/event/{id}` rewritten — source of truth = proposal `order_items` (NOT menu courses). Groups by `(event_date, section_title, section_time)`, expands `event_dates` for multi-día. Response shape: `{event_id, event_name, calendar_dates, guest_count, days:[{date, tandas:[{tanda_key, date, section_title, section_time, section_end_time, guest_count, recipes:[...], extras:[...], allergens, dietary_tags}], tanda_count}], totals, snapshot_hash, last_print, changed_since_print, allergens_aggregate, dietary_tags_aggregate}`. NO `price/cost/unit_price` fields exposed. Items without a recipe link surface as `extras` (no scaled ingredients, still printed).
- `POST /api/kitchen-beo/event/{id}/mark-printed` — persists a row in `kitchen_beo_print_log` with snapshot_hash, printed_by, scope. Idempotent. If caller omits `snapshot_hash`, server falls back to computing the current hash to avoid stuck-as-drifted state.
- `GET /api/kitchen-beo/batch?start_date&end_date&include_stages` — returns one BEO payload per event in the date range whose `stage`/`operational_status` is in the include list (default Won/Committed/Confirmed). Sorted by first calendar date.
- `snapshot_hash` is built from a normalized tuple (numeric values rounded to 4 dp) so float jitter doesn't cause phantom drift.

**Frontend**:
- `KitchenBEO.js` rewritten — renders days → tandas (with section time pill + allergen badges). Banner shows green "Sin cambios desde última impresión" or amber "⚠ Cambios desde última impresión" depending on `changed_since_print`. Print uses the synchronous iframe pattern (Safari-safe) + POSTs `/mark-printed`.
- `KitchenBEOPrint.js` (new) — shared print template. Each `(day, tanda)` is a `<section class="sheet">` with `page-break-after: always`. No prices. Includes allergen alerts, dietary tags, scaled ingredients in 2-col layout, presentation/chef notes.
- `KitchenSheetsBatch.js` (new) — at `/food-ops/kitchen-sheets`. Date-range filter, list with per-row badges ("nunca impresa" / "impresa" / "cambios desde impresión"), select-all toggle, summary stats (sheets / pages / with-changes), batch print button (disabled while in-flight). Marks all selected events as printed in parallel after print().
- `FoodOpsPage.js` — new nav item "Hojas de Cocina" → /food-ops/kitchen-sheets + route mount.
- `DocumentPreview.js` `handlePrint` rewritten — clones `printRef.current.outerHTML` and copies ALL parent document `<link rel="stylesheet">` + `<style>` tags into the iframe head. Adds a small set of @page + print overrides. The printed PDF is now visually identical to the on-screen preview (Tailwind classes, shadows, padding, fonts all carry over). Removed ~170 lines of hand-built HTML.

**Validation** (`/app/test_reports/iteration_185.json` — 100% pass):
- Backend pytest 10/10 + regression on `test_sprint4_culinary_phase2.py::test_kitchen_beo_endpoint` still passes. Drift detection works: marking with one hash then mutating order_item quantity → `changed_since_print=true`. Empty hash auto-fills server-side (verified post-fix). Hash is deterministic across calls.
- Frontend batch path: select → print → iframe injected → `window.print()` once → `/mark-printed` POSTed → toast → row badge flips to green "printed".
- Test file: `/app/backend/tests/test_kitchen_beo_v2.py` (idempotent, restores state).

**Known caveats / follow-ups** (logged from testing agent code review):
- `list_kitchen_beo_batch` reuses `get_kitchen_beo` in a loop (N+1 round-trips). Fine for ≤50 events in a range; for orgs with 100+ confirmed events in a range we may want to batch the recipe lookup.
- Single-event `KitchenBEO` dialog and `DocumentPreview` clone-print were not interactively exercised due to module-access mismatch on demo.agency (no food-ops module). Same code path validated indirectly via batch print.
