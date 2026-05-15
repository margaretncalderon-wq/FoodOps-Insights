# Culinary Intelligence Module — Estado Actual (audit, May 14 2026)

Este documento describe **EXACTAMENTE** lo que existe hoy en Kora OS para el módulo de Culinary Intelligence: backend endpoints, modelos de datos, UI, integraciones y limitaciones. Sirve como base para planear la próxima fase.

---

## 0. Arquitectura General

```
/food-ops/
├── inventory/                ← Ingredients + Supplies + Equipment (ONE table: db.ingredients)
├── recipes/                  ← Recetas (Base / Component / Final) — db.recipes
├── menus/                    ← Plated Menus (degustación visual) — db.plated_menus
├── production/               ← Production Batches (mise-en-place) — db.production_batches
├── purchase-orders/          ← Compras por evento — db.purchase_orders + db.po_lines
├── consolidated/             ← Compras agregadas multi-evento
├── physical-count/           ← Conteo cíclico / inventario físico
└── import-export/            ← CSV / Excel import
```

**Otra colección relevante** que vive fuera de `/food-ops/`:
- `db.menus` — **Menús de Catálogo** (los que el ProposalEditor usa via PackagePicker). Gestionados en `Settings → Catálogos → Menús`.
- `db.base_menus` — DEPRECATED (era target de `save-scaled-menu` antes del fix del 14-may; ahora vacía, redirigido a `db.menus`).
- `db.picklist_items` — Servicios / Rentas / Fees (no comida) que se enlazan a quotes via `Settings → Catálogos → Tipos de Ítems`.

**Router prefixes**:
- `/api/inventory` → ingredients, transactions, low-stock, reserve, par
- `/api/recipes` → CRUD + scale + cost-history + duplicate + recalculate-all + save-scaled-menu
- `/api/plated-menus` → CRUD de menús emplatados
- `/api/production` → batches + mise-en-place
- `/api/purchase-orders` → POs + receive + register-invoice
- `/api/operations` → reorder-list, below-par helpers
- `/api/suppliers` → suppliers + supplier_items (precio por proveedor)
- `/api/settings/menus` → catalog menus (usados en quotes)
- `/api/settings/picklist` → no-food items (Service / Rental / Fee)

---

## 1. INVENTORY (Ingredients) — `/food-ops/inventory`

### 1.1 Concepto
Una **sola colección `db.ingredients`** almacena ingredientes-comida, suministros, descartables, equipo y consumibles de evento. El discriminador es `inventory_type`:
- `food` — RAW (lechuga, harina) o PREPARED (ya vinculado a una receta via `linked_recipe_id`)
- `packaging` — empaques (cajas, bolsas)
- `disposable` — descartables (cubiertos plásticos, vasos)
- `equipment` — equipo (con `replacement_cost`, `useful_life_years`, `depreciation_rate`)
- `event_supply` — suministros de evento (manteles, sillas reusables tracked)

### 1.2 Schema completo (`Ingredient`)
| Campo | Tipo | Comentario |
|---|---|---|
| `ingredient_id` | str | PK: `ing_xxx` |
| `company_id` | str | multi-tenant |
| `name`, `brand`, `category` | str | category: protein, dairy, produce, dry_goods, beverage, packaging, etc. |
| `inventory_type` | enum | ver 1.1 |
| `item_type` | "RAW" / "PREPARED" | PREPARED se calcula desde su receta enlazada |
| `linked_recipe_id` | str opt | para PREPARED |
| `unit` | str | `g, kg, ml, l, oz, lb, unit, ea, pieza` |
| `cost_per_unit` | float | $ por `unit` |
| `stock_quantity` | float | On Hand físico |
| `reserved_quantity` | float | Reservado para eventos (lógico, no físico) |
| `available_quantity` (computed) | float | `on_hand - reserved` |
| `min_stock_level`, `par_level`, `reorder_threshold` | float | alertas low-stock |
| `yield_waste_percent` | float | merma estándar por ingrediente; se aplica en cost calc |
| `allergens` | list[str] | enum: gluten, dairy, eggs, soy, nuts, peanuts, shellfish, fish, sesame |
| `storage_location` | str | dry, fridge, freezer |
| `preferred_supplier_id`, `alternate_supplier_ids` | str list | links a `db.suppliers` |
| `pack_size`, `pack_unit` | float, str | unidad de compra (1 case=24 units) |
| `replacement_cost` | float | solo equipment |
| `cost_center`, `purchase_date`, `useful_life_years`, `depreciation_rate` | — | depreciation para equipment |
| `sku`, `barcode`, `notes` | str | |
| **Sistema v2 de unidades** | | |
| `base_unit` | str | canónica (g/ml/unit) |
| `cost_per_base_unit` | float | derivado de purchase data |
| `density_g_per_ml` | float | habilita weight↔volume conversion |
| `purchase_unit`, `purchase_quantity_per_unit`, `purchase_cost` | — | "venden bolsa de 1kg a $5" → base_unit=g, cost_per_base_unit=0.005 |
| `custom_conversions` | dict | overrides {unit:factor_in_base} |
| `is_discrete_unit` | bool opt | Recipe Scaling redondea arriba (huevos) |
| `needs_review` | bool | marcado por importación/wizard de reparación |
| `average_cost`, `price_history` | float, list | FIFO running avg cuando se reciben POs |

### 1.3 Endpoints
| Método | Path | Función |
|---|---|---|
| GET | `/api/inventory/ingredients` | Lista con filtros (type, category) |
| POST | `/api/inventory/ingredients` | Crear |
| GET | `/api/inventory/ingredients/{id}` | Get one |
| PUT | `/api/inventory/ingredients/{id}` | Update full |
| PATCH | `/api/inventory/ingredients/{id}` | Update parcial |
| DELETE | `/api/inventory/ingredients/{id}` | Borrar (soft if referenced) |
| POST | `/api/inventory/ingredients/{id}/adjust` | Ajuste de stock (Purchase/Usage/Waste/Adjustment) — escribe en `inventory_transactions` |
| POST | `/api/inventory/ingredients/cost-preview` | Calcula `cost_per_base_unit` antes de guardar |
| GET | `/api/inventory/low-stock` | items donde `stock_quantity < par_level` |
| GET | `/api/inventory/below-par` | alias |
| GET | `/api/operations/reorder-list` | low-stock agrupados por preferred_supplier |

### 1.4 UI — `InventorySection`
4 tabs:
- **Items**: tabla con `name, brand, category, on_hand, available (=on_hand-reserved), cost, supplier`. Filtros por type/category/search.
  - Botones: `Add`, `Import` (CSV), `Wizard` (asistente IA para reparar items mal capturados), `Edit`, `Adjust stock`.
  - Filas en rojo si `on_hand < par_level`. Filas en ámbar si tienen `reserved_quantity > 0`.
- **Suppliers**: CRUD de proveedores + precio-por-proveedor (`supplier_items` con precio histórico).
- **Transactions**: histórico de movimientos (`db.inventory_transactions`: Purchase/Usage/Adjustment/Waste).
- **Low Stock**: items que cruzan `par_level` con badge contador.

### 1.5 Asistente (Wizard) — Ingredient Repair
Componente `IngredientWizard.js`. Si el item tiene `needs_review=true` o `cost_per_unit=0`, el asistente:
1. Pregunta unidad base (g/ml/unit)
2. Pregunta pack size + costo del pack
3. Calcula `cost_per_base_unit`
4. Marca `needs_review=false`

**Limitación conocida**: aún hay **864 ingredientes legacy** con `needs_review=true` que no se han reparado (target de auto-repair con IA — P2).

### 1.6 Conexiones
- **→ Recipes** (`calculate_recipe_cost`): cada receta lee el `cost_per_unit` actual al calcular su costo
- **→ Production**: BOM expansion lee stock para mostrar gaps
- **→ Purchase Orders**: `receive` actualiza `stock_quantity` + `average_cost` (FIFO running)
- **→ Events**: reserva lógica via `reserved_quantity` cuando se confirma proposal

---

## 2. RECIPES — `/food-ops/recipes`

### 2.1 Modelo (`Recipe`)
Recetas con jerarquía:
- `recipe_type = "Final"` → plato terminado vendible
- `recipe_type = "Component"` → componente reusable (salsa, base)
- `recipe_type = "Base"` → ya preparado como ingrediente (PREPARED ingredient lo enlaza)

Campos clave:
- **Rendimiento**: `yield_quantity` + `yield_unit` (e.g. 1 receta rinde 4 `portion`)
- **Porción**: `portions_per_yield`, `portion_size`, `portion_unit`
- **Ingredientes** (`ingredients: RecipeIngredient[]`):
  - `item_id` (FK ingredient_id o recipe_id)
  - `item_type` ("ingredient" o "recipe")
  - `quantity`, `unit`
  - `waste_factor_pct` (override del default del ingrediente)
- **Sub-recipes** (`sub_recipes: [{recipe_id, quantity, unit}]`) — componentes anidados
- **Allergens, dietary_tags** → propagados a quotes
- **Tiempos**: `prep_time_minutes`, `cook_time_minutes`, `labor_minutes`
- **Pricing**: `default_portion_price`, `sell_price`
- **Margin**: `min_margin_pct` (override de política)
- **Photo**: `photo_url`
- **Instrucciones**: `instructions` (str) — soporta legacy array de steps
- **Flags**: `is_public` (usable en menús), `is_on_menu` (signature menu del cliente)
- **Computed**: `total_cost`, `cost_per_portion`, `margin_percentage`

### 2.2 Endpoints
| Método | Path | Función |
|---|---|---|
| GET | `/api/recipes` | lista + filtro por `recipe_type` |
| POST | `/api/recipes` | crear (auto-calc cost) |
| GET | `/api/recipes/{id}` | get one |
| PUT | `/api/recipes/{id}` | update (auto-recalc) |
| DELETE | `/api/recipes/{id}` | borrar |
| POST | `/api/recipes/{id}/duplicate` | clonar |
| POST | `/api/recipes/{id}/scale` | **scale preview read-only** (factor, ingredientes escalados, sub-recetas) — discrete-unit ingredients hacen `math.ceil` |
| POST | `/api/recipes/save-scaled-menu` | persiste como Menú en `db.menus` (menu_type='Scaled') sin tocar receta base |
| GET | `/api/recipes/{id}/cost-history` | timeline de cambios de costo |
| POST | `/api/recipes/recalculate-all` | bulk recompute para todos los recipes (después de price update masivo) |
| POST | `/api/recipes/ai-analyze` | LLM analiza receta y sugiere mejoras |
| GET | `/api/recipes/{id}/portion-formats` | formats personalizados (pieza, ración, kilo, etc.) |
| POST | `/api/recipes/{id}/portion-formats` | añadir format |

### 2.3 Cost Calculation (`calculate_recipe_cost`)
Soporta:
- Conversión de unidades real via `utils/units.py` (`cost_for_recipe_line`, `normalize_unit`)
- Sub-recetas (recursivo — `cost_per_portion * quantity_used`)
- Waste por línea (explicit override) o default del ingrediente
- Items PREPARED → lee `cost_per_portion` de su recipe enlazada
- Si `quantity * cost = 0` se loguea con `needs_review`

### 2.4 UI — `RecipeBuilder.js`
**5 tabs**:
- **Basic**: name, name_es, category, photo_url, allergens, dietary_tags, recipe_type, is_on_menu, work_category, recipe_code, verified_status
- **Costing**: yield_quantity/unit, portions_per_yield, lista de ingredientes (con `IngredientPicker` searchable combobox, waste override per line), sub-recipes (`RecipePicker`), **live cost preview** (total + per portion + margin si tiene sell_price), `min_margin_pct` override
- **Details**: prep/cook/labor times, difficulty, instructions, presentation_notes, chef_notes
- **Packaging**: portion_formats (pieza/ración/kg/personalizado) — usados por ProposalEditor para mostrar opciones al rep
- **Scale** (NEW, May 14): target portions input + event dropdown (auto-loads guest_count), summary cards (factor, total cost, $/portion), tabla con indicator "↑" para items discretos, botón "Guardar como Menú" → escribe en `db.menus`

**Pickers**:
- `IngredientPicker.js` — searchable combobox que filtra por nombre/SKU
- `RecipePicker.js` — para sub-recipes
- Ambos lazy-load + caché

### 2.5 UI — `RecipesSection`
- Cards de stats: total recetas, on_menu count, draft count
- **Cost Health Dashboard** embedded (section mode) — ver §6
- Lista con filtros, búsqueda
- Botón "Recalcular costos masivos" (preview → apply)

### 2.6 Conexiones
- **→ Inventory**: lee `cost_per_unit` actual cada vez que se calcula costo
- **→ Menus (catalog)**: `recipe_id` referenciado en `MenuItemEntry`
- **→ Plated Menus**: cada `MenuCourse.item.recipe_id`
- **→ ProposalEditor**: `order_items.reference_id = recipe_id` cuando `item_type=Food`
- **→ Production**: BOM expansion
- **→ Cost Staleness**: cuando `recipe.cost_per_portion` cambia, los OrderItems con snapshot anterior se marcan stale

### 2.7 Limitaciones conocidas
- No hay scaling automático en ProposalEditor (debes editar `quantity` manualmente)
- AI Recipe Assistant (sugerir recetas desde inventory) — pendiente P2
- 864 ingredients sin reparar bloquean costing preciso de muchas recetas

---

## 3. MENUS — Dos colecciones distintas

### 3.1 **Catalog Menus** (`db.menus`) — usados en cotizaciones
Gestionados en **`Settings → Catálogos → Menús`** (NO en `/food-ops/menus`).

Schema (`Menu` + `MenuItemEntry`):
- `menu_id`, `company_id`, `name`, `name_es`, `description`, `category_id`
- `menu_type` — libre, ej: "Buffet", "Plated", "Cocktail", "Scaled" (auto-generado por Recipe Scaling)
- `items: MenuItemEntry[]`:
  - `recipe_id` o `picklist_item_id`
  - `custom_name`, `custom_description` (overrides del nombre de la receta)
  - `quantity`, `unit_price_override`, `internal_cost_override`
  - `sort_order`
- `variants` — ej: "Tradicional", "Premium" (cambian precios)
- `default_price`, `is_fixed_price`, `is_active`
- **Scaled-specific extras** (cuando `menu_type='Scaled'`):
  - `source='recipe_scaling'`, `source_event_id`
  - `scaled_snapshots: [{recipe_id, target_portions, scale_factor, ingredients_snapshot, sub_recipes_snapshot}]`

Endpoints:
- GET/POST/PUT/DELETE `/api/settings/menus`
- GET `/api/settings/menus/{id}` (incluye `enrich_menu_items` que resuelve recipe/picklist data)

UI: `Settings → Catálogos → Menús` — CRUD completo.

**Usado por**: `PackagePicker.js` en ProposalEditor → bulk-add menú entero al quote.

### 3.2 **Plated Menus** (`db.plated_menus`) — `/food-ops/menus`
Schema (`PlatedMenu` + `MenuCourse`):
- `menu_type`: plated / buffet / cocktail / grab_and_go
- `pricing_model`: per_guest / fixed
- `serving_style`: plated / family_style / stations
- `courses: MenuCourse[]`:
  - `course_name` (appetizer, salad, entree, dessert)
  - `course_order`
  - `items: [{recipe_id, recipe_name, portions_per_guest, notes}]`
- `buffer_percentage` (extra % para prep loss)
- `cost_per_guest` (computed sum de recetas), `cost_with_buffer`

Endpoints: `/api/plated-menus` CRUD + auto-cálculo de costo.

UI: `PlatedMenusSection` en FoodOpsPage — lista + builder visual con drag de cursos.

### 3.3 **Diferencia funcional**
- `catalog menus` → **transaccional** (lo que se vende en quotes)
- `plated_menus` → **presentación** (lo que se muestra al cliente como menú degustación). NO se inyecta automáticamente al quote.

**Limitación**: no hay link de "convertir plated_menu → catalog_menu". Si quieres vender el plated_menu, copias manualmente.

---

## 4. PRODUCTION — `/food-ops/production`

### 4.1 Concepto
Production Batches = "vamos a producir N porciones de receta X para evento Y". Expande BOM, muestra gaps de inventario, registra consumos.

### 4.2 Schema (`ProductionBatch`)
- `batch_id`, `batch_number` (auto: `PROD-YYYY-NNNN`)
- `linked_event_id`, `event_name`
- `lines: [{recipe_id, target_output_qty, multiplier, computed_inputs: [{item_id, name, type, required_qty, unit, unit_cost, total_cost, in_stock}]}]`
- `status`: Draft / In Progress / Completed / Cancelled
- `total_input_cost`
- `scheduled_date`, `completed_date`
- `created_at`, `created_by`

### 4.3 Endpoints
- POST `/api/production/batches` — crear, auto-expand BOM
- GET `/api/production/batches` — lista
- PUT `/api/production/batches/{id}/start` — In Progress
- POST `/api/production/batches/{id}/complete` — Completed (escribe `inventory_transactions` tipo Usage para descontar)
- POST `/api/production/mise-en-place` — genera lista agrupada por categoría (Mise/Cocción/Empaque) para evento
- GET `/api/production/{event_id}/sheet` — PDF print-ready

### 4.4 UI — `ProductionSection`
- Tabla de batches con filtros por status
- Detail view: ingredientes expandidos, columna "in_stock" vs "required", chips rojos si falta
- Botón "Generar Mise en Place" para evento → PDF descargable

### 4.5 Conexiones
- **← Recipes**: BOM expansion recursiva (incluye sub-recipes)
- **→ Inventory**: al completar batch, descuenta `stock_quantity` y escribe `inventory_transactions`
- **→ Events**: opcional `linked_event_id` (un evento puede tener N batches)

### 4.6 Limitaciones
- No hay "auto-create batch from event" (debes elegir recetas manualmente)
- No descuenta inventario automáticamente al confirmar proposal (solo cuando completas el batch manualmente)

---

## 5. PURCHASE ORDERS & CONSOLIDATED PURCHASES

### 5.1 Concepto
Comprar lo que falta para producir.

### 5.2 Schema (`PurchaseOrder`)
- `po_id`, `po_number` (`PO-YYYY-NNNN`)
- `supplier_id`, `event_id` (opt)
- `lines: PurchaseOrderLine[]`:
  - `ingredient_id`, `ingredient_name`, `quantity_needed`, `quantity_on_hand`, `quantity_to_order`
  - `purchase_unit`, `pack_size`, `unit_cost`, `total_cost`
- `status`: Draft / Sent / Partial / Received / Cancelled
- `subtotal`, `tax_rate`, `tax_amount`, `total_amount`
- `invoice_number` (opt — cuando registras factura)
- `received_at`, `created_at`

### 5.3 Endpoints
- CRUD completo `/api/purchase-orders`
- POST `/api/purchase-orders/{id}/receive` — full o partial; actualiza `stock_quantity`, `average_cost`, escribe `inventory_transactions`
- POST `/api/purchase-orders/{id}/register-invoice` — vincula factura del proveedor
- PUT `/api/purchase-orders/{id}/status` — cambio manual de estado

### 5.4 UI — `PurchaseOrdersSection`
- Tabla con filtros por status, supplier
- Detail view: lines con stock actual + faltante + costo
- Acciones: Send, Receive (modal con qty recibida por línea), Register Invoice

### 5.5 Consolidated Purchase — `/food-ops/consolidated`
Agrupa POs multi-evento por ingrediente + supplier para emitir UNA orden grande. Útil cuando tienes 3 eventos la misma semana que necesitan los mismos ingredientes.

UI: `ConsolidatedPurchaseSection.js` — selección de eventos → agrupa items → crea PO unificada.

### 5.6 Conexiones
- **← Production**: gap de inventario sugiere PO
- **← Operations Reorder**: items por debajo de `par_level` aparecen en `/api/operations/reorder-list`
- **→ Inventory**: receive actualiza stock
- **→ Suppliers**: linked

---

## 6. COST HEALTH & MARGIN POLICY (transversal, vive en módulo de Proposals)

### 6.1 Concepto
Detecta cuándo el costo snapshot en una cotización Draft ha quedado desactualizado vs la fuente de verdad (recipe / picklist). También aplica política de margen mínimo jerárquica.

### 6.2 Endpoints (`/api/proposals/...`)
| Endpoint | Función |
|---|---|
| GET `/{id}/cost-staleness` | detail por OrderItem: snapshot vs current, diff_pct |
| POST `/{id}/refresh-costs` | actualiza `internal_cost` (NO `unit_price`); con gating Fase 3 |
| GET `/cost-health/overview` | global: todos los Drafts stale con margins, type_breakdown, below_threshold |
| POST `/cost-health/refresh-all` | bulk refresh (skip below-threshold si no admin/owner/finance) |
| POST `/{id}/request-margin-approval` | rep pide aprobación → notif in-app a admin/owner/finance |
| GET/PUT `/api/settings/margin-policy` | política {by_type:{Food:35,...}, by_category:[{item_type,category,min_margin_pct}]} |

### 6.3 Resolución de umbral (`resolve_min_margin`)
Cascada (priority desc):
1. `Recipe.min_margin_pct` / `PicklistItem.min_margin_pct` (override por ítem)
2. `policy.by_category[].min_margin_pct` (regla por categoría)
3. `policy.by_type[item_type]` (default por tipo)
4. `DEFAULT_MARGIN_BY_TYPE` seed (Food=35, Service=40, Rental=50, Fee=60, Other=30)

### 6.4 UI — `CostHealthDashboard.js`
- **Card mode** (System Pulse): auto-oculta si nothing stale. Mini-list top-3 con inline refresh + chips por tipo
- **Section mode** (Food Ops Recipes): tabla completa con checkboxes, summary strip, columna Margen con breakdown por tipo
- Phase 3 gating: rol ∈ {owner,admin,finance} para override; otros ven "Solicitar aprobación"
- Audit en `db.cost_refresh_audit`; notifs in-app en `db.notifications` (type='margin_approval_request')

---

## 7. ALLERGENS & DIETARY TAGS

- `Ingredient.allergens` → propaga a `Recipe.allergens` (auto-union al guardar)
- `Recipe.allergens` + `dietary_tags` → propaga a `OrderItem._recipe_allergens` cuando se agrega a quote
- `ProposalEditor` los muestra y los incluye en el **PDF de propuesta** (sección "Alérgenos / Información dietaria")

---

## 8. PORTION FORMATS (transversal Recipe → Quote)

Cada receta puede tener N `portion_formats`:
- `format_name` ("Pieza", "Ración 200g", "Bandeja x12")
- `cost_per_unit`, `default_price`, `unit_label`
- Cuando ProposalEditor agrega un Food item, el rep elige el format → setea `internal_cost`, `unit_price`, descripción

---

## 9. CONEXIONES ENTRE MÓDULOS — Mapa

```
INGREDIENTS  ←──── recipe.ingredients
     ▲              ▲
     │              │
     │       RECIPE.cost_per_portion ──┐
     │              ▲                  │
     │              │                  ↓
     │       PLATED_MENU (visual)    CATALOG_MENU (transactional)
     │                                 ↓
     │                            ProposalEditor.order_items ──→ COST_STALENESS
     │                                                                ↑
     │                                                                │
PURCHASE_ORDER ─→ INGREDIENT.stock + average_cost (FIFO)               │
     ↑                                                                 │
     │                                                                 │
PRODUCTION_BATCH (consume stock)  ←──── Event (linked)                  │
                                          ↑                            │
                                          └─── Proposal ───────────────┘
```

---

## 10. LIMITACIONES / PLACEHOLDERS / DEUDA TÉCNICA

| Issue | Severidad | Comentario |
|---|---|---|
| 864 ingredients legacy con `needs_review=true` | P1 | Bloquea costing preciso. Plan: auto-repair con LLM. |
| No hay auto-deduct de inventory al confirmar proposal | P1 | Solo descuenta al `complete` un production batch. Pierdes visibilidad real-time. |
| No hay link `plated_menu → catalog_menu` | P2 | Si quieres vender, copias manualmente. |
| Recipe scaling NO se aplica auto al cambiar `quantity` en proposal | P1 | El rep solo cambia qty, sin scaling visual de ingredientes. |
| No filterable recipe tags (Vegan/GF/Kosher) en UI de búsqueda | P1 | dietary_tags existen pero no hay UI de filtro fuerte. |
| `db.base_menus` deprecated y vacía | resuelto | Bug fix May-14. |
| AI Recipe Assistant (sugerir recetas según inventory) | P2 | No existe — propuesto. |
| Production batch no se auto-crea desde event | P2 | Manual. |
| No hay Production Plan view (compras agregadas por evento sumando recetas) | P1 | Propuesto next. |
| Mocked SMTP (gmail) — no envía POs por email | demo_mode | Requiere App Password del user. |
| Plated Menu cost_per_guest NO se mantiene stale-aware | P2 | Si cambias costo de receta, no se refresca cost_per_guest del plated_menu. |
| Cost Refresh Audit no tiene UI dedicada | P2 | Datos están, falta reporte visual. |
| `recipe.is_on_menu` vs catalog `menu.items` desincronizado | P2 | Marcar receta `is_on_menu=true` no la agrega al menú catalog automáticamente. |
| Inventory reservation `reserved_quantity` no se desactiva auto cuando event se cancela | P2 | Quedan reservados ítems para eventos cancelados → falsos low-stock. |

---

## 11. SUPPORTING DATA (lo que ya está poblado en demo)

- 1 receta base usable: `recipe_8d95bf9a2f56` (Ensalada Caprese, 1 portion yield)
- ~22 Draft proposals para testing de cost staleness
- 0 plated_menus default
- 0 production batches
- Política de margen default no configurada (usa seed defaults)

---

## 12. INTEGRACIONES EXTERNAS QUE USA EL MÓDULO

- **Emergent LLM Key** (Universal): usado en `/api/recipes/ai-analyze` y `IngredientWizard` (sugerencia de unidades base)
- **SMTP (Gmail)**: para enviar POs (mocked en demo, requiere App Password)
- **No usa**: Stripe, fal.ai, ElevenLabs, WhatsApp Business API en este módulo

---

## 13. ROADMAP PENDIENTE (siguiente fase sugerida)

**P0 (críticas)**
1. Auto-deduct de inventory al confirmar proposal (cierra el loop)
2. Auto-repair de 864 legacy ingredients con LLM

**P1 (alto valor)**
3. Production Plan view por evento (compras agregadas sumando recetas)
4. Filterable recipe tags en UI
5. Recipe scaling integrado en ProposalEditor (cuando cambias qty, ves ingredientes escalados)
6. Plated Menu cost staleness (mismo sistema que catalog menus)

**P2 (mejora continua)**
7. Reporte de Overrides de Margen en Settings → Diagnostics
8. AI Recipe Assistant (sugerir recetas según inventory disponible + costos)
9. Convertir Plated Menu → Catalog Menu con un click
10. Inventory reservation auto-release al cancelar event

---

*Generado: May 14 2026. Referencia: `/app/backend/server.py`, `/app/backend/models/events.py`, `/app/frontend/src/pages/FoodOpsPage.js`, `/app/frontend/src/components/RecipeBuilder.js`, `/app/frontend/src/components/PackagePicker.js`, `/app/frontend/src/components/CostHealthDashboard.js`.*
