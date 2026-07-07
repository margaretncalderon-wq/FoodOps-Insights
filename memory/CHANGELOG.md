# Kora OS - Changelog


## February 2026 — Refactor: server.py Phase 3 (Suppliers + Inventory)

### Extractions (server.py: 21,578 → 19,297 lines, −2,281 in this slice / −20.7% cumulative from 24,342)

**Suppliers slice**
- **`routers/suppliers.py`** (new, ~137 lines): 8 endpoints — CRUD (`GET`/`POST`/`PUT`/`DELETE`), extended update, plus supplier-items (SKU mapping + by-ingredient lookup).
- **`models/suppliers.py`** (new): `Supplier`, `SupplierCreate`, `SupplierItemCreate`, `SupplierExtendedUpdate`.

**Inventory slice (the big one)**
- **`routers/inventory.py`** (new, ~1,997 lines): full Inventory module. Endpoints for ingredient CRUD, adjust/patch, low-stock, valuation, transactions, reserve/release-reservation, reservations list, AI Repair + undo, extended fields, price history CRUD, bulk upload by supplier, update-prices-from-invoice, value-summary, import (validate/import/template). Also **owns `_recalc_recipes_using_ingredient`** helper (only caller left in server.py after refactor).
- Also brings along `purchase_list_router` (Purchase Lists endpoints — 5 routes) which was interleaved with inventory endpoints. Registered separately from server.py via re-export.
- **`models/inventory.py`** (new): `Ingredient(Create)`, `InventoryItem(Create/Update)`, `InventoryTransaction(Create)`, `InventoryItemExtendedUpdate`, `InventoryPriceHistory(Create)`.

### Not extracted in this slice
- `@operations_router` endpoints (`/operations/items`, `/below-par`, `/reorder-list`) stayed in server.py — belong to a different router prefix; will move when Operations gets its own extraction.
- `BulkProductUpload` Pydantic body model was moved along with its endpoint into `routers/inventory.py`.

### Verified
- Backend restarts clean (no import errors).
- Smoke test PASS on 16 GETs across every touched module (inventory, ingredients, low-stock, valuation, transactions, reservations, value-summary, import-template, recipes, plated-menus, suppliers, events, purchase-lists, people-ops, menu-engineering, kitchen-beo).
- Full CRUD cycle on `/api/inventory/ingredients` (create → PUT → GET → adjust → PATCH → extended → DELETE) all 200 ✓.
- Full CRUD cycle on `/api/suppliers` (create → GET → extended → DELETE) all 200 ✓.
- Frontend landing page renders correctly.
- Ruff lint on new files: only pre-existing style warnings (bare-except, unused-vars) — no F821 undefined names.

### Notes for next session
- `server.py` is now **19,297 lines** (down from 24,342 at the start). Next best extraction targets:
  - **`routers/events.py`** + `models/events.py` (~1,500 lines) — Events, event menu, stock check.
  - **`routers/purchase_orders.py`** (~700 lines) — after inventory.
  - **`routers/proposals.py`** (~2,000 lines) — proposals, items, financials.
- The pre-existing `list_cost_variance` broken import in `culinary_digest.py` remains (silently returns `[]`).



## February 2026 — Refactor: server.py Phase 2 (Recipes)

### Extractions (server.py: 23,122 → 21,578 lines, −1,544 in this slice / −11.4% cumulative from 24,342)
- **`routers/recipes.py`** (new, ~1,445 lines): full Recipe module.
  - Endpoints: CRUD (`GET/POST/PUT/DELETE`), duplicate, scale-preview, save-scaled-menu, cost-history, ai-analyze, suggest-ingredients-bulk, suggest-ingredients, recalculate-all, portion-formats CRUD, packaging-formats CRUD, generate-picklist-items, image upload/delete, extended update.
  - Helpers (exported for use in `_recalc_recipes_using_ingredient` etc. in server.py): `calculate_recipe_cost`, `compute_full_recipe_costing`, `check_circular_dependency`, `is_discrete_unit_for_ingredient`, `_scale_ingredient_line`, `DISCRETE_UNIT_HINTS`.
- **`models/recipes.py`** (new): `RecipeIngredient`, `RecipeCreate`, `Recipe`, `RecipePortionFormat(Create)`, `RecipePackagingFormat(Create)`, `RecipeExtendedUpdate`, `RecipeScalePreview`, `SaveScaledMenuRequest`.
- **`utils/legacy_units.py`** (new): `UNIT_CONVERSIONS` dict + `convert_units` helper.
- `server.py` imports these back for the 3 remaining callsites (`_recalc_recipes_using_ingredient`, etc.).

### Kept in server.py (not in this slice)
- `@inventory_router.post("/ingredients/ai-repair")` and `.../undo/{history_id}` — these belong to inventory, will move when inventory router is extracted.

### Bug fix caught during refactor
- `POST /api/recipes/{id}/duplicate` was returning the mutated MongoDB doc **with `_id` (ObjectId)** after insert, causing `PydanticSerializationError: Unable to serialize unknown type: ObjectId`. Fixed by `new_recipe.pop("_id", None)` before return. This bug existed in production code but was not being hit by clients — surfaced by curl smoke test after refactor.

### Verified
- Backend restarts clean (no import errors).
- Smoke test PASS: `/api/recipes` (GET, POST, PUT, DELETE, duplicate, scale, cost-history, portion-formats, recalculate-all), `/api/inventory`, `/api/plated-menus`, `/api/events`, `/api/menu-engineering/analyze`, `/api/buffet-factors`, `/api/kitchen-beo/batch`, `/api/people-ops/employees`, `/api/inventory/ingredients`, `/api/suppliers`, `/api/notifications` — all 200 OK.
- Frontend landing page renders correctly.
- Ruff lint on all new files: no errors.




## February 2026 — Refactor: server.py Phase 1 (Culinary Slices)

### Extractions (server.py: 24,342 → 23,122 lines, −1,220 / −5%)
- **`routers/buffet_factors.py`** (new): `BuffetFactorCreate` model + `_resolve_buffet_factor` helper + 4 CRUD endpoints. Also exports `_resolve_buffet_factor` for use in server.py's remaining projected-cost / kitchen-BEO callsites (imports back).
- **`routers/kitchen_beo.py`** (new): 3 endpoints (`GET /event/{id}`, `POST /event/{id}/mark-printed`, `GET /batch`). Uses `_resolve_buffet_factor` from the buffet_factors module. 447 lines relocated.
- **`routers/plated_menus.py`** (new): 10 endpoints — CRUD + `recalculate-all`, `staleness`, `refresh-costs`, `projected-cost`, `convert-to-catalog`. Also owns `calculate_menu_cost` helper (no external callers). 595 lines relocated.
- **`models/plated_menus.py`** (new): `MenuCourse`, `PlatedMenuCreate`, `PlatedMenu`, `PlatedMenuExtendedUpdate`.
- server.py now imports these routers/helpers instead of declaring them.

### Verified
- Backend restarts clean (no import errors).
- Smoke test PASS: `/api/recipes`, `/api/inventory`, `/api/plated-menus`, `/api/events`, `/api/menu-engineering/analyze`, `/api/buffet-factors`, `/api/kitchen-beo/batch`, `/api/people-ops/employees` all return 200.
- Full CRUD cycle on `/api/plated-menus` (create → staleness → delete) works end-to-end.
- Frontend landing page renders (smoke screenshot).
- Ruff lint on new files: no errors.

### Notes for next session
- server.py still holds Recipes (~1,150 lines), Inventory/Suppliers (~2,000 lines), Events, Proposals, etc. Recommended next slice: **Recipes** (models + helpers `calculate_recipe_cost`, `compute_full_recipe_costing`, `check_circular_dependency` + CRUD/scale/AI endpoints).
- Pre-existing broken import spotted in `culinary_digest.py`: `from server import list_cost_variance` — that function no longer exists in server.py. Wrapped in try/except so it silently returns `[]`. Should be fixed when Cost Variance endpoints are re-introduced. NOT caused by this refactor.
- `cost_variance_router` is declared in server.py (line 178) with no attached endpoints — leftover from a prior partial refactor. Safe to remove when Cost Variance is properly re-introduced.



## February 2026 — Iteration 197

### Bug Fix: Third calendar missing meal-split (user follow-up)
- **CalendarPage.js** (`/calendar`): Was still hitting `/api/events` and rendering one chip per event, hiding breakfast/lunch on the same day. Now fetches `/api/orchestration/calendar` (services + calendar_dates), uses `getEntriesForDate` like the other two calendars, and renders one chip per meal with the time prefix (e.g. "08:00 Desayuno", "12:00 Almuerzo"). Skipped-day backfill also respected.
- **Regression suite**: New pytest `/app/backend/tests/test_calendar_meal_split.py` (2 tests) verifies the backend returns 2 distinct services for a same-day Desayuno + Almuerzo proposal.
- **All 3 calendars now consistent**: `EngagementCalendar.js`, `EventCalendarTab.js`, `CalendarPage.js`.
- Backend also tightened: `/api/kitchen-beo/batch` window filter switched from "span overlap" to "any date inside window" so non-consecutive multi-day events don't surface in windows that contain no actual event date.


## February 2026 — Iteration 194-195

### Feature: Digital Approval Capture on Client Portal
- **Client Portal** (`/portal/:documentId`): When document type is `proposal`/`quote`, CTA reads "Aprobar Cotización" / "Approve Quote". New email input field (optional). Amber disclosure box about acceptance terms. Confirm button reads "Firmar y Aprobar".
- **Backend** (`POST /api/portal/document/{id}/sign`):
  - Persists `signature` (data URL), `signed_by`, `signed_email`, `signed_ip` (X-Forwarded-For aware), `signed_user_agent`, `signed_at`, `status='signed'`.
  - Propagates to linked `proposals` record (status=`approved`, client_signature, client_signed_*). When `doc.proposal_id` is missing (legacy docs), falls back to lookup by `event_id`.
- **DocumentPreview**: Right-side signature block now renders `client-captured-signature` image when `proposal.client_signature` exists, plus signer name + timestamp.
- Tested via `testing_agent_v3_fork` iter 194 → 195. **Backend 7/7 pytest passing**. E2E portal sign verified with real client IP captured.


## February 2026 — Iteration 193

### Bug Fixes: Client Engagement + Event Orchestration (4 bugs)
1. **Thousands separator (system-wide)**: New `utils/format.js → fmtNum(n)` helper using `Intl.NumberFormat`. Bulk-replaced 292 `.toFixed(2)` occurrences across 64 files. `DocumentPreview.formatCurrency` now uses `buildCurrencyFormatter` (Intl.NumberFormat with locale). Output: `RD$6,481.25` instead of `RD$6481.25`.
2. **Meals split in calendar**: `EngagementCalendar` now fetches `/api/orchestration/calendar` (with `services` per event). New `getEntriesForDate` helper renders each meal (Desayuno, Almuerzo) as its own block in Month + Week views with time prefix. Each block has `data-testid="calendar-entry-{eventId}-{idx}"`.
3. **Skipped days bug**: `_expand_event_dates` in `backend/server.py` (2 locations) and `EngagementCalendar.getEventsForDate` now respect explicit `event_dates` arrays — no consecutive-range backfill when user supplied non-consecutive dates.
4. **Signature & Stamp on all docs**: New `Company` model fields `signature_image_url`, `stamp_image_url`, `signatory_name`, `signatory_title`. New POST `/api/settings/company/signature` and `/stamp` upload endpoints (multipart, 2MB max, base64 data URL). Settings UI adds "Firma y Sello" Card. `DocumentPreview` renders a `document-signature-block` at the bottom of every doc with stamp+signature on the left and client signature line on the right ("Firma del cliente — Aprobado").

### Side fix
- Timezone bug across system (Iteration 192.5): `new Date("YYYY-MM-DD").toLocaleDateString()` was showing day-before in UTC-X timezones. Bulk-replaced 138 occurrences across 73 files with `formatDateOnly(value, language)` helper.

Tested via `testing_agent_v3_fork` iteration_193 — **100% backend (7/7) + 100% frontend (all 4 bugs)**.


## February 2026 — Iteration 192

### Bug Fix: Salary Configuration UI + Bilingual Departments (People Ops)
- **EmployeeProfile.js Compensation tab**: Added editable violet "Configuración de Salario" card with inputs for `base_salary`, `currency`, `payment_frequency`, `weekly_hours_regular` (only visible in Edit mode). Read-only card now shows "Sin definir / Not set" with helpful hint when salary=0.
- **EmployeeProfile.js Employment Info card**: Job Role is now editable via free-text Input (primary) with an optional Select dropdown to link to Recruitment catalog (data-testids: `edit-job-title`, `edit-job-role-select`).
- **Departments bilingual support**: New optional `name_en` and `name_es` fields in Department model. POST/PUT `/api/people-ops/departments` persist them. OrganizationStructureSection dialog adds dedicated Spanish/English name inputs. Departments table and EmployeeProfile dropdown render localized name based on UI language with fallback to `name`.
- Empty string values for `name_en`/`name_es` are normalized to `None` to preserve fallback semantics.
- Tested via testing_agent_v3_fork iteration_192 — 100% pass on backend (6/6) and frontend (15/15).

## March 14-15, 2026

### Feature: Rich Text Content Editor for Posts & Ideas (Demand Studio)
- Added `content_body` field to SocialPostCreate, SocialPost, ContentIdeaCreate, ContentIdea models
- Enhanced RichTextEditor with Strikethrough, Checklist, multi-color highlight picker (9 colors)
- Integrated as "Contenido / Script" section in Post and Idea dialogs
- Fixed Enter key and bullet points visibility in editor

### Feature: RichTextEditor + File Attachments in Execution Hub
- Integrated RichTextEditor for Goal Notes, Task Descriptions, and Task Notes
- File attachments in notes (images, PDFs, Word, Excel, video - max 15MB)
- NoteAttachments component with image thumbnails and document download links

### Bug Fix: Full CRUD Access for Shared Company Profiles (Demand Studio)
- Fixed 8 backend endpoints to accept `org_id` query param with membership fallback
- Frontend: All CRUD calls now send org_id via getOrgParam()

### Bug Fix: Missing Memberships for Company Owners (Ciano Gourmet)
- Root cause: Users who owned companies had no membership record, breaking aggregated visibility
- Fix: `ensure_owner_membership()` auto-creates admin membership on first API call
- Migration: Backfilled 40 missing memberships across all users

### Feature: New "Calendarizado/Calendar" Status
- Added between "Idea" and "Production" for scheduling workflow

### Feature: Renamed "Borrador/Drafted" to "Listo/Ready"
- Status label updated across all views and dropdowns

### Feature: Archived Tab in Demand Studio
- New tab between Feed and Metrics shows archived posts and ideas
- Edit, restore, or delete archived items directly

### Feature: Platform Icons in Calendar
- Calendar post cards show platform icons (Instagram, TikTok, etc.) instead of colored dots
- Channel filter dropdown shows platform icons next to account names

### Bug Fix: Text Overflow in Execution Hub
- Fixed horizontal overflow in tasks, notes, decisions, dependencies

### Bug Fix: Delete Tasks in Execution Hub
- New DELETE /api/execution-hub/tasks/{id} endpoint with task count update

## March 12, 2026
### Previous session fixes (auth, visibility, notifications, UI)
