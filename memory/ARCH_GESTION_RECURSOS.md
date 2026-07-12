# Arquitectura Actual — Módulo Gestión de Recursos

*Documento generado el 2026-02-11 antes de agregar nuevas funcionalidades.*
*Fuente: `/app/backend/models/`, `/app/backend/routers/`, `/app/backend/server.py`.*

---

## 1. ¿Cómo está modelada la tabla de Inventario?

En realidad **hay DOS colecciones distintas** en MongoDB, ambas usadas por el módulo:

### 1.A `db.ingredients` (colección principal — culinary + operations)

Modelo: `models/inventory.py::Ingredient` (Pydantic).
Usada para: alimentos, empaques, desechables, **equipos**, insumos de evento.

**Campos actuales:**

| Campo | Tipo | Uso |
|-------|------|-----|
| `ingredient_id` | `str` | PK visible (`ing_<hex>` o `legacy_<...>`) |
| `company_id` | `str` | Tenant — TODA query filtra por esto |
| `name` | `str` | Nombre visible |
| `brand` | `str?` | Marca |
| `category` | `str` | `protein`, `dairy`, `produce`, `dry_goods`, `beverage`, `packaging`, ... |
| `inventory_type` | `str` | `food`, `packaging`, `disposable`, **`equipment`**, `event_supply` |
| `item_type` | `str` | `RAW` o `PREPARED` (para prep-recipes) |
| `linked_recipe_id` | `str?` | Si `PREPARED`, apunta a una recipe |
| `unit` | `str` | `g`, `kg`, `ml`, `L`, `oz`, `lb`, `unit` |
| `cost_per_unit` | `float` | Costo unitario |
| `stock_quantity` | `float` | Stock físico total |
| `reserved_quantity` | `float` | **Cantidad reservada por eventos** (default 0) |
| `min_stock_level`, `par_level`, `reorder_threshold` | `float` | Umbrales |
| `yield_waste_percent` | `float` | % de merma |
| `allergens` | `List[str]` | `[nuts, dairy, gluten, ...]` |
| `storage_location` | `str` | `dry`, `fridge`, `freezer` |
| `preferred_supplier_id`, `alternate_supplier_ids` | `str?`, `List[str]` | FK lógico a `db.suppliers.supplier_id` |
| `pack_size`, `pack_unit` | `float`, `str` | Ej: 1 caja = 12 unidades |
| `average_cost` | `float` | Promedio ponderado histórico |
| `price_history` | `List[Dict]` | Bitácora inline `[{supplier_id, unit_cost, effective_date, source}]` |
| **Campos de EQUIPO** (`inventory_type=equipment`): | | |
| `replacement_cost` | `float` | Costo si se pierde/daña |
| `cost_center` | `str` | `operations`, `kitchen`, `service`, `logistics`, `admin` |
| `purchase_date`, `useful_life_years`, `depreciation_rate` | | Para depreciación contable |
| **Sistema de unidades v2:** | | |
| `base_unit`, `cost_per_base_unit`, `density_g_per_ml` | | Unidad base + conversiones |
| `purchase_unit`, `purchase_quantity_per_unit`, `purchase_cost` | | Compra |
| `custom_conversions` | `Dict[str, float]` | Conversiones ad-hoc |
| `is_discrete_unit` | `bool?` | Redondear al escalar recetas |
| **Metadata:** | | |
| `sku`, `barcode`, `description`, `image_url`, `notes` | | |
| `non_yieldable` | `bool?` | Merma NO reutilizable |
| `needs_review` | `bool` | Marcado por importaciones/AI |
| `created_at`, `updated_at` | `datetime` | |

### 1.B `db.inventory_items` (colección legacy paralela)

Modelo: `models/inventory.py::InventoryItem`. Estructura más simple:
`item_id`, `company_id`, `name`, `inventory_type`, `category`, `unit`, `pack_size`, `pack_unit`, `current_stock`, `reserved_quantity`, `par_level`, `preferred_supplier_id`, `cost_per_unit`, `status`, `created_at`, `updated_at`.

**Importante:** el nombre de los campos difiere (`current_stock` vs `stock_quantity`, `item_id` vs `ingredient_id`). El módulo de **conduces** (`delivery_notes`) usa `inventory_item_id` que apunta a **ambas** (según el flujo). Hay un helper de reparación legacy (`utils/legacy_repair.py`) que ya mapea `current_stock → stock_quantity`, `unit_cost → cost_per_unit` en `db.ingredients`.

### Colecciones satélite del módulo

- `db.inventory_transactions` — bitácora atómica (`Purchase`, `Usage`, `Adjustment`, `Waste`) con `event_id` opcional.
- `db.inventory_reservations` — reservas ligadas a eventos (ver §3).
- `db.inventory_price_history` — histórico de precios por proveedor.

---

## 2. Relaciones entre Inventario, Conduces, Conteo de Activos y Contratos de Proveedores

### 2.A Conduces (Delivery Notes) — SÍ EXISTE

- **Colección:** `db.delivery_notes`
- **Modelo:** definido inline en `server.py::DeliveryNoteCreate` / `DeliveryNoteCheckIn` (aún no extraído a `models/`)
- **Endpoint:** `/api/delivery-notes` (router `delivery_notes_router` en `server.py`)
- **Estructura del documento:**
  ```
  {
    note_id, note_number ("DN-0001"), company_id, event_id,
    items: [{ inventory_item_id, name, inventory_type,
              qty_out, qty_returned, qty_lost, replacement_cost,
              loss_cost, unit, status }],
    status ("pending" | "delivered" | "returned"),
    checkout_date, expected_return_date, ...
  }
  ```
- **Índices creados** (`config.py`): `company_id`, `note_id` unique, `(company_id, status)`
- **Relación con Inventario:** `items[].inventory_item_id` apunta a `db.ingredients.ingredient_id` **O** a `db.inventory_items.item_id` (el ID que exista). No hay FK dura — se resuelve en la lógica de aplicación.
- **Relación con Eventos:** `event_id` obligatorio → apunta a `db.events.event_id`.

### 2.B Conteo de Activos — NO existe como módulo separado

**No hay** colecciones `db.asset_counts`, `db.conteo_activos` ni endpoints dedicados.

Lo que sí existe: los ítems con `inventory_type=equipment` en `db.ingredients` cargan campos de depreciación (`replacement_cost`, `purchase_date`, `useful_life_years`, `depreciation_rate`, `cost_center`). Los **conduces** anteriores rastrean `qty_out/qty_returned/qty_lost` de equipos por evento — eso es lo más cercano a un "conteo" hoy: es un rastreo por evento, no un inventario físico periódico.

### 2.C Contratos de Proveedores — NO existe como módulo separado

**No hay** colección `db.supplier_contracts` ni modelo `SupplierContract`.

Lo que sí existe en `db.suppliers` (modelo `Supplier`):
- `payment_terms` (`"net30"`, `"cash"`, `"transfer"`, `"credit"`, `"mixed"`)
- `delivery_days` (lista de días)
- `minimum_order`, `lead_time`
- `is_preferred`, `status`
- Extendido: `has_credit`, `credit_limit`, `tax_id`

También `db.supplier_items` (SupplierItemCreate) enlaza `supplier_id ↔ ingredient_id` con `supplier_sku`, `purchase_unit`, `pack_size_conversion`, `last_purchase_price`, `tax_rate`. Esto es como una **lista de precios** por proveedor, no un contrato.

### 2.D ¿Comparten IDs?

| Módulo | ID | Tipo | Referencia a |
|--------|----|------|--------------|
| Ingredients | `ingredient_id` | `str` "ing_...` | Nadie apunta hard a esto |
| Inventory Items (legacy) | `item_id` | `str` | Nadie apunta hard |
| Delivery Notes | `note_id` | `str` "dn_..." | contiene `event_id` + `items[].inventory_item_id` |
| Reservations | `reservation_id` | `str` "res_..." | contiene `event_ids[]` + `inventory_item_id` |
| Suppliers | `supplier_id` | `str` "sup_..." | Referenciado por `ingredients.preferred_supplier_id` y `supplier_items.supplier_id` |
| Purchase Orders | `po_id` | `str` "po_..." | contiene `supplier_id` + `lines[].ingredient_id` |
| Events | `event_id` | `str` "event_..." | Referenciado por delivery_notes, reservations, transactions |

**Todos los IDs son strings custom con prefijos** (no ObjectIds). Están **ligados lógicamente pero sin FKs duras de Mongo** — la aplicación es la que garantiza integridad (o no).

---

## 3. ¿Existe un concepto de "Evento" al que ligar reservas?

**SÍ, robusto y ya integrado con inventario.**

### `db.events` (modelo `models/events.py::Event`)

Campos relevantes: `event_id`, `company_id`, `name`, `client_id`, `client_name`, `event_date`, `end_date`, `event_dates[]` (multi-día no-consecutivo), `guest_count`, `status`, `event_type`, `venue_id`, etc.

### Integración Inventario ↔ Eventos ya construida

1. **`db.inventory_reservations`** — modelo:
   ```
   { reservation_id, company_id, inventory_item_id, item_name,
     event_ids: [event_id, ...], event_names: [...],
     quantity_reserved, previous_reserved, new_reserved,
     on_hand, available_after,
     status: "active" | "consumed" | "released",
     created_at, created_by,
     release_reason: "event_cancelled" | "event_deleted" | "manual" | ... }
   ```
   Una reserva puede ligar **múltiples eventos** (útil para menús que sirven varios eventos en la misma preparación).

2. **Endpoints activos:**
   - `POST /api/inventory/reserve` — crea reserva, aumenta `ingredients.reserved_quantity`
   - `POST /api/inventory/release-reservation` — libera (por reservation_id, item_id o event_id)
   - `GET /api/inventory/reservations?event_id=` — consulta

3. **Auto-release en `routers/events.py::_auto_release_event_reservations`** — cuando un evento cambia a `stage_archived` o se borra, sus reservas activas se marcan `released` automáticamente con `release_reason="event_cancelled"` o `"event_deleted"`.

4. **`db.inventory_transactions.event_id`** — cada consumo/compra/ajuste puede llevar un `event_id` para trazabilidad.

5. **Conduces** (§2.A) — cada conduce tiene `event_id` **obligatorio**.

---

## 4. Resumen ejecutivo (para decisiones de arquitectura futura)

| Concepto | Estado | Modelo | Colección | Observación |
|----------|--------|--------|-----------|-------------|
| **Inventario general** | ✅ Maduro | `Ingredient` | `db.ingredients` | Modelo principal. También `db.inventory_items` legacy paralelo (a migrar) |
| **Conduces (Delivery Notes)** | ✅ Funcional | inline en `server.py` | `db.delivery_notes` | Modelo aún NO extraído a `models/`. Ítems apuntan a `inventory_item_id` (soft FK) |
| **Conteo de Activos** | ❌ NO existe | — | — | Cerca hay: `inventory_type=equipment` + `delivery_notes.qty_returned/qty_lost` |
| **Contratos de Proveedores** | ✅ **YA EXISTE** (implementado 2026-02-11) | `SupplierContract` en `models/supplier_contracts.py` | `db.supplier_contracts` | CRUD + adjuntos + rollup de facturas linkadas por `expenses.contract_id`. Enlaza a Partners y contabilidad. |
| **Eventos ligados a Inventario** | ✅ Robusto | `Event` + `inventory_reservations` | `db.events`, `db.inventory_reservations` | Auto-release en cancelación/borrado ya implementado |

### Recomendaciones antes de agregar nuevos features
1. **Reusar `event_id` como pivot** — cualquier nueva funcionalidad (conteo de activos, contrato de proveedor con fecha X, etc.) puede engancharse al event_id existente. No inventar un pivot nuevo.
2. **Extender `Ingredient` con `inventory_type` nuevos** antes que crear colecciones nuevas — ya lo hicimos con `equipment`, `event_supply`. Un `contract_asset` es plausible.
3. **Cuando llegue el momento de "Conteo de Activos"**, considerar un modelo `AssetCount { count_id, company_id, count_date, location, items: [{inventory_item_id, expected_qty, counted_qty, variance}], status }` — reutiliza `inventory_item_id` como soft FK a `db.ingredients`.
4. **Contratos de Proveedor**: extender `db.suppliers` con un sub-doc `contracts[]` puede ser más liviano que crear `db.supplier_contracts`. Solo separar en colección propia si vamos a versionar o adjuntar PDFs.
5. **Refactor pendiente**: `delivery_notes` sigue definido INLINE en `server.py` (~línea 7566). Migrarlo a `routers/delivery_notes.py` + `models/delivery_notes.py` va en la fila del backlog P2 de refactor.
