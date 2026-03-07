# Kora OS - Product Requirements Document

## Original Problem Statement
Kora OS es una plataforma CRM de marketing y gestión de eventos para agencias creativas. El objetivo principal es proporcionar herramientas integradas para:
- Gestión de clientes y pipeline de ventas (Client Engagement)
- Orquestación de eventos/proyectos (Event Orchestration)  
- Generación de demanda y marketing (Demand Studio)
- Claridad empresarial y análisis (Business Clarity)
- **Gestión de RRHH y Nómina (People Ops)**
- **Sistema de Pagos Variables con 4 tipos independientes**
- **Historial de pagos por empleado**
- **Beneficios en especie (almuerzo/catering) con tracking y Cost Center**
- **Módulo de Partners para gestión de proveedores, agencias y socios externos**
- **Culinary Intelligence para gestión de inventario, recetas y planificación de producción**

## User Personas
- **Agencias de Marketing/Eventos**: Usuarios principales que gestionan múltiples clientes y proyectos
- **Colaboradores**: Miembros de equipo con acceso limitado a ciertas organizaciones
- **Super Admins**: Administradores con acceso a herramientas de gestión avanzadas
- **HR Admins**: Personal de RRHH con acceso a gestión de empleados y nómina

## Core Requirements
1. Sistema multi-organización con selector de empresa
2. Permisos granulares por sección (campañas, social media, etc.)
3. Filtrado de datos por organización seleccionada
4. Vinculación bidireccional entre módulos
5. Sistema de nómina completo con cálculos legales de RD
6. Sistema de pagos variables con 4 flujos independientes: Overtime, Comisiones, Bonos, Incentivos
7. **Historial completo de pagos por empleado**
8. **Tracking de beneficios en especie con cargo a Cost Center**
9. **Gestión integral de Partners con integración financiera**
10. **Culinary Intelligence con generación de planes de preparación basados en menús y recetas**

---

## What's Been Implemented

### Session: March 7, 2026 (ÚLTIMA ACTUALIZACIÓN)

#### Feature 1: Separación de Factura y Recepción de PO ✅

**Problema reportado por usuario**: No quiere que se cree un gasto en Payables sin recibir una factura física del proveedor.

**Solución implementada**:

1. **Backend** (`server.py`):
   - Modificado `receive_purchase_order`: ahora `create_expense=False` por defecto
   - El expense solo se crea si se proporciona `invoice_number`
   - Nuevo endpoint `POST /api/purchase-orders/{po_id}/register-invoice`:
     - Permite registrar factura en POs ya recibidas
     - Crea el expense/payable solo cuando se registra factura
     - Incluye campos: invoice_number, invoice_date, due_date, tax_amount, invoice_url

2. **Frontend** (`PurchaseOrdersSection.js`):
   - Checkbox "Registrar Factura del Proveedor" con texto explicativo
   - Default desactivado, solo activa cuando hay factura
   - Nuevo diálogo para registrar factura posterior
   - Botón 📋 (Receipt icon) para POs recibidas sin factura
   - Indicador ✓FAC cuando PO tiene factura registrada

**Flujo implementado**:
```
PO Created → PO Sent → PO Received (inventory updated, NO expense)
                              ↓
                    [Registrar Factura] → Expense/Payable creado
```

---

#### Feature 2: Columna de Merma (Waste %) en Prep Plan ✅

**Solución implementada**:

1. **Backend** (`server.py`):
   - Añadido campo `waste_percent` en respuesta del prep plan
   - Se toma de `waste_factor_pct` de la receta o `yield_waste_percent` del inventario
   - Añadido campo `base_required` para mostrar cantidad antes de merma

2. **Frontend** (`ConsolidatedPurchaseSection.js`):
   - Badge naranja `+X% merma` junto al nombre del ingrediente
   - Aparece en Stock Requisition y Purchase List
   - Solo se muestra si waste_percent > 0

---

#### Bug Fix: "Generate Prep Plan" en Culinary Intelligence - CORREGIDO ✅

**Problema reportado**: El botón "Generate Prep Plan" no generaba ingredientes ni costos para eventos con menús asignados. Mostraba $0.00 en todos los campos.

**Causa raíz múltiple**:
1. El código buscaba `item_id` en ingredientes de recetas, pero el campo correcto era `ingredient_id`
2. El código solo procesaba recetas desde `order_items` con `reference_id`, pero el evento tenía menú asignado directamente sin propuesta con referencias
3. El campo `guest_count` del evento estaba como `None` en lugar del valor esperado

**Solución implementada** (`server.py`):

1. **Soporte para `ingredient_id`** (líneas 8528-8530, 8604-8606):
```python
item_id = ing.get("item_id") or ing.get("ingredient_id")
```

2. **Priorizar recetas desde `menu_id` del evento** (nuevo código líneas 8486-8524):
   - Obtiene el menú asignado al evento usando `menu_id`
   - Extrae todas las recetas de todos los cursos del menú
   - Calcula porciones basadas en `guest_count × portions_per_guest`
   - Fallback a `order_items` si no hay menú asignado

3. **Actualización del evento con `guest_count`**: 
   - El evento "Wedding - TEST" ahora tiene 150 guests configurados

**Resultado verificado**:
```json
{
  "stock_requisition": [
    {"item_name": "Tomatoes Roma", "total_required": 24.75, "in_stock": 30.0, "total_cost": 61.88},
    {"item_name": "Olive Oil", "total_required": 16.5, "in_stock": 10.0, "total_cost": 120.0},
    {"item_name": "Salt", "total_required": 2.81, "in_stock": 20.0, "total_cost": 4.21},
    {"item_name": "Chicken Breast", "total_required": 49.5, "in_stock": 50.0, "total_cost": 420.75}
  ],
  "purchase_list": [
    {"item_name": "Olive Oil", "to_purchase": 6.5, "total_cost": 78.0}
  ],
  "sr_total_cost": 606.84,
  "total_cost": 78.0,
  "grand_total": 684.84
}
```

**Testing**: Verificado via API y UI - El prep plan ahora genera correctamente:
- 4 items en Stock Requisition (SR) con costos calculados
- 1 item en Purchase List (PL) con cantidad faltante
- Totales correctos para planificación de compras

---

### Session: March 6, 2026

#### Proyección de Cash Flow 30/60/90 días - COMPLETADO ✅

**Backend** (`business_clarity.py`):
- Nuevo endpoint `/api/business-clarity/cash-flow/projection`
- Calcula proyecciones basadas en:
  - Cuentas por Cobrar (AR): Facturas abiertas agrupadas por período de vencimiento
  - Cuentas por Pagar (AP): Payables y expenses pendientes agrupados por período
- Incluye `liquidity_alert` cuando hay flujo negativo proyectado

**Frontend** (`CashFlowSection.js`):
- Nueva pestaña "Proyección" en el módulo Cash Flow
- Tarjetas de resumen para 30/60/90 días con:
  - Expected Inflows, Expected Outflows, Net Projection
  - Bordes verdes/rojos según sea positivo/negativo
- Detalle de AR y AP por período (vencido, 30 días, 30-60, 60-90)
- Alerta visual de liquidez cuando hay proyección negativa

---

#### Notificaciones de Seguimiento (Follow-ups) - COMPLETADO ✅

**Backend** (`notifications.py`):
- Nuevo endpoint `POST /api/notifications/generate-follow-up-reminders`
- Genera notificaciones automáticas para seguimientos:
  - Vencidos: ⚠️ Prioridad alta, título "Seguimiento vencido"
  - Hoy: 📅 Prioridad alta, título "Seguimiento hoy"
  - Mañana: 🔔 Prioridad normal, título "Seguimiento mañana"
- Previene duplicados usando metadata de entity_id + fecha

**Frontend**:
- `NotificationBell.js`: Llama a generar notificaciones al cargar
- `FollowUpsSection.js`: También genera notificaciones al cargar follow-ups
- Notificaciones aparecen en la campana del header

**Modelo** (`models/crm.py`):
- Agregados campos `next_follow_up_date` y `follow_up_type` a `ClientCreate`

---

#### Integración Cash Flow con P&L - COMPLETADO ✅

**Frontend** (`ProfitLossDashboard.js`):
- Nueva sección "P&L vs Cash Flow" que compara:
  - **P&L (Base Devengado)**: Ingresos reconocidos, Costos reconocidos, Utilidad bruta
  - **Cash Flow (Base Efectivo)**: Efectivo recibido, Efectivo pagado, Flujo neto
- **Análisis de Variación**:
  - Cash vs Revenue: Indica si hay cuentas por cobrar pendientes
  - Payments vs Costs: Indica si hay costos por pagar
  - P&L vs Cash Difference: Compara posición contable vs efectivo real
- **Obligaciones Pendientes**: Badges visuales para montos vencidos, esta semana, este mes
- Sincronización de filtros de fecha entre P&L y Cash Flow

**Testing**: Verificado visualmente - la sección muestra correctamente la comparación de datos contables vs efectivo.

---

#### Bug Fix: Etiqueta "Overhead" en Centro de Costo - CORREGIDO ✅

**Problema reportado**: En la tabla de Cuentas por Pagar, cuando un gasto estaba asignado a un centro de costo específico (ej: "Logistics"), la UI mostraba "→ Overhead" lo cual era confuso/incorrecto.

**Causa raíz**: En `PayablesSection.js` línea 405, el texto secundario para gastos con `cost_center` asignado decía "→ Overhead" en lugar de indicar correctamente que es un centro de costo.

**Solución**: Cambiado el texto de "→ Overhead" a "→ Centro de Costo" / "→ Cost Center" para reflejar correctamente que el gasto está clasificado en un centro de costo específico.

**Testing**: Verificado visualmente - el gasto "Ferreteria" asignado a "Logistics" ahora muestra correctamente "Logistics → Cost Center".

---

#### Refactor Navegación Business Clarity + Vendors Unificados - COMPLETADO ✅

**Navegación refactorizada** (7 tabs principales):
- Dashboard (link directo)
- **Billing ▼**: Invoices, Client Payments, Statements
- **Receivables ▼**: AR Aging, Collections, Payment Tracking
- **Payables ▼**: Vendor Bills, Vendor Payments, AP Aging
- **Financials ▼**: Fixed Costs, Reports, P&L, Sales Reports, Admin, Payroll Cost, Marketing ROI, Regulatory, Accounting
- Cash Flow (link directo)
- Close (link directo)

**Vendors unificados**:
- `GET /api/business-clarity/vendors` - Lista unificada de Partners + Suppliers
- `POST /api/business-clarity/vendors` - Crear nuevo vendor (se guarda como Partner)
- Dropdown muestra badges "Partner" o "Supplier" para identificar fuente
- Formulario de gastos ahora REQUIERE selección de vendor (sin entrada manual)
- Botón "+" para crear nuevo vendor directo desde el formulario

**Testing**: 100% backend (12/12 tests), 100% frontend

---

#### Módulo de Flujo de Caja Completo - COMPLETADO ✅

**Backend** (`routers/business_clarity.py`):
- `GET /api/business-clarity/cash-flow` - Reporte de flujo de caja con inflows/outflows
- `GET /api/business-clarity/petty-cash` - Balance y transacciones de caja chica
- `POST /api/business-clarity/petty-cash/transactions` - Registrar depósito/retiro
- `PUT /api/business-clarity/petty-cash/fund-limit` - Actualizar límite del fondo
- `GET /api/business-clarity/all-payments` - Todos los pagos (recibidos y realizados)

**Frontend** (`CashFlowSection.js`):
- **Tab Cash Flow**: Summary cards (Inflows/Outflows/Net/Pending), detalle de ingresos y egresos, proyección de salidas de efectivo (vencido, esta semana, este mes, posterior)
- **Tab Payments**: Lista unificada de pagos recibidos (clientes) y realizados (proveedores) con badges de color
- **Tab Petty Cash**: Balance actual, límite del fondo, historial de transacciones, dialog para nuevo depósito/retiro
- Filtros de fecha en todos los tabs

**Testing**: 100% backend (21/21 tests), 100% frontend

---

#### Registro de Pagos en Cuentas por Pagar (AP) - COMPLETADO ✅

**Backend** (`routers/business_clarity.py`):
- `POST /api/business-clarity/payables/{id}/payments` - Registrar pago parcial/total
- `POST /api/business-clarity/payables/{id}/mark-paid` - Marcar como pagado
- `GET /api/business-clarity/payables/{id}/payments` - Historial de pagos
- Soporte para métodos: transferencia, efectivo, cheque, tarjeta, otro
- Validaciones: monto positivo, no exceder saldo
- Estados: pending → partial → paid

**Frontend** (`PayablesSection.js`):
- Botones de acción: $ (registrar pago), ✓ (marcar como pagado)
- Dialog de pago con: resumen (Total/Pagado/Saldo), monto, fecha, método, referencia, notas
- Botones rápidos: "Pago Total" y "50%"
- Historial de pagos visible en el dialog
- Badges de estado: Pending (gris), Partial (ámbar), Paid (verde)

**Testing**: 93.75% backend (15/16 tests), 100% frontend

---

#### Formulario "Nuevo Gasto" en Business Clarity - COMPLETADO ✅

**Frontend** (`components/business-clarity/PayablesSection.js`):
- Botón "+ New Expense" en sección AP (Accounts Payable)
- Dialog modal con campos:
  - Proveedor (dropdown de proveedores existentes)
  - Nombre de proveedor manual (si no hay proveedor seleccionado)
  - Descripción (requerido)
  - Monto (requerido)
  - Número de factura
  - Fecha de vencimiento
  - Asignación: Sin asignar (Overhead) / Evento / Categoría de Costo Fijo
- Mensaje informativo dinámico según tipo de asignación
- Validación de campos requeridos
- Toast de éxito y actualización automática de tabla

**Testing**: 100% backend (15/15 tests), 100% frontend

---

#### Archivos Adjuntos para Partners - COMPLETADO ✅

**Backend** (`routers/partners.py`):
- `GET /api/partners/{id}/attachments` - Lista de archivos adjuntos
- `POST /api/partners/{id}/attachments` - Subir archivo (multipart form)
- `DELETE /api/partners/{id}/attachments/{att_id}` - Eliminar archivo
- `GET /api/uploads/partner_attachments/{filename}` - Servir archivos
- Tipos de documento: catalog, coi, contract, license, portfolio, price_list, w9, nda, sow, other
- Formatos soportados: PDF, imágenes (JPEG, PNG, WebP, GIF), Word, Excel
- Límite: 10MB por archivo

**Frontend** (`PartnerDetailPage.js`):
- Nuevo tab "Documents" con badge contador
- Formulario de upload: archivo, tipo, descripción, fecha vencimiento
- Lista de archivos: thumbnail/icono, nombre, tipo, tamaño, descripción
- Previsualización en modal para imágenes y PDFs
- Botones: Vista previa, Descargar, Eliminar con confirmación

**Testing**: 100% backend (13/13 tests), 100% frontend

---

#### Módulo Partners - COMPLETADO ✅

**Backend** (`routers/partners.py`, `models/partners.py`):
- CRUD completo: Create, Read, Update, Delete partners
- Endpoints de integración financiera:
  - `GET /api/partners/{id}/financial-summary` - Resumen financiero
  - `GET /api/partners/{id}/transactions` - Transacciones vinculadas
  - `GET /api/partners/{id}/invoices` - Facturas vinculadas  
  - `GET /api/partners/{id}/purchase-orders` - Órdenes de compra
  - `GET /api/partners/{id}/payables` - Cuentas por pagar
  - `GET /api/partners/{id}/events` - Eventos relacionados
- Filtros avanzados: por status, tipo, categoría, ubicación, búsqueda
- Opciones de dropdown dinámicas

**Frontend** (`pages/Partners/`):
- `PartnersPage.js` - Lista con KPI cards, filtros, búsqueda
- `PartnerDetailPage.js` - Detalle con 4 tabs: Details, Commercial, Finance, Performance
- `PartnerFormPage.js` - Formulario completo con 5 tabs: Basic, Location, Contact, Commercial, System
- Tab Finance muestra datos de integración cuando hay supplier vinculado
- Mensaje "No Linked Supplier" con botón para vincular

**Navegación**:
- Módulo Partners agregado a `CORE_MODULES` en `addons.py`
- Icono: handshake
- Rutas: `/partners`, `/partners/new`, `/partners/:id`, `/partners/:id/edit`

**Testing**: 100% backend (15/15 tests), 100% frontend

---

#### Usuarios de Prueba con Diferentes Roles - COMPLETADO ✅

**Usuarios creados:**
| Usuario | Email | Role | Permisos |
|---------|-------|------|----------|
| María García | hr.manager@kora.com | HR | People Ops, empleados, nómina, vacaciones |
| Carlos López | finance.manager@kora.com | Finance | Business Clarity, reportes financieros |
| Ana Martínez | marketing@kora.com | Marketing | Demand Studio, campañas, contenido |

**Contraseña para todos:** `Test2024!`

**Roles creados:**
- `role_e5eb2bb447a7` - Human Resources
- `role_8003a56d09c0` - Marketing
- `role_2bb0653ce05a` - Manager

**Fix aplicado:** Auth router ahora soporta ambos campos `password` y `password_hash` para compatibilidad

---

#### Auditoría de Permisos Granulares - COMPLETADO ✅

**Backend** (`business_clarity.py`):
- Nuevo endpoint `GET /permissions/audit` - Matriz completa de permisos
- Nuevo endpoint `GET /permissions/my-access` - Permisos del usuario actual
- Constante `PERMISSION_MATRIX` con estructura detallada por módulo

**Frontend** (`RolesSettingsSection.js`):
- Agregados nuevos módulos de permisos:
  - **Business Clarity**: View, Invoices, Payments, Payables, Fixed Costs
  - **Financial Reports**: Executive, Sales, P&L, Budget Alerts, Regulatory
  - **People Ops / HR**: Employees, Payroll (view/edit/approve), Time Off, Offboarding, Cost Centers
  - **Demand Studio**: View, Campaigns, Content, Social Metrics, Connect Accounts
  - **Settings**: View, Manage, Users, Roles

- Agregados nuevos roles predefinidos:
  - **HR (Recursos Humanos)**: Acceso a People Ops y aprobación de vacaciones
  - **Marketing**: Acceso a Demand Studio y campañas
  - **Manager (Gerente)**: Vista limitada de equipo y aprobación de time off

**Acceso**: Settings → Team → Roles

---

#### Alertas Automáticas de Presupuesto - COMPLETADO ✅

**Backend** (`business_clarity.py`):
- Nuevo endpoint `GET /reports/budget-alerts` con umbrales configurables
- **Niveles de severidad**:
  - Warning (amarillo): ≥80% utilización
  - Critical (naranja): ≥90% utilización  
  - Exceeded (rojo): >100% utilización

**Frontend** (`ProfitLossDashboard.js`):
- Sección visual de alertas con iconos y colores según severidad
- Muestra: Centro de Costo, % utilización, Actual/Budget, Restante
- Se actualiza automáticamente con cada refresh

**Alertas detectadas (Marzo 2026)**:
| Centro de Costo | Utilización | Severidad |
|-----------------|-------------|-----------|
| Marketing Interno | 95.5% | Critical |
| Administración General | 82.0% | Warning |

---

#### Dashboard Visual P&L con Presupuestos - COMPLETADO ✅

**Frontend** (`ProfitLossDashboard.js`):
- **4 KPIs principales**: Revenue, Total Costs, Gross Profit/Loss, Gross Margin %
- **Gráfico de pastel**: Desglose de costos por categoría
- **Gráfico de barras horizontal**: Gastos reales vs presupuesto por Centro de Costo
- **Tarjetas de detalle**: Porcentaje de cada tipo de costo sobre el total
- **Resumen de totales**: Presupuestado ($193K), Real ($239K), Variación (-$46K)

**Presupuestos configurados para Marzo 2026:**
| Centro de Costo | Presupuesto | Actual | Utilización |
|-----------------|-------------|--------|-------------|
| Marketing Interno | $170K | $162K | 95.5% |
| Administración | $15K | $12K | 82.0% |
| Tecnología/IT | $8K | $3K | 37.5% |

**Backend**: Corregido endpoint `/reports/cost-center-actual` para leer presupuestos de `monthly_budgets`

---

#### Hub Central de Marketing "Insights" - COMPLETADO ✅

**Frontend** (`InsightsPage.js`):
- Dashboard centralizado que unifica métricas de Marketing
- **4 KPIs principales**: Seguidores, Emails Enviados, Leads, Gasto Total
- **3 Tarjetas de resumen**: Redes Sociales, Email Marketing, Campañas

**Testing**: Frontend 100% - Ver `/app/test_reports/iteration_92.json`

---

#### Integración OAuth con YouTube - COMPLETADO ✅

**Backend** (`demand_studio.py`):
- Endpoints OAuth: `GET /social-metrics/youtube/auth-url`, `POST /social-metrics/youtube/callback`
- Scopes: `youtube.readonly`, `yt-analytics.readonly`

**Frontend**: Botón "Connect" para YouTube + página de callback (`YouTubeCallbackPage.js`)

---

#### Motor de Contabilización - Inventario y Ventas - COMPLETADO ✅

**Backend** (`accounting_engine.py`):
- `record_invoice()` - Registra facturas como revenue automáticamente
- `record_inventory_movement()` - Registra movimientos de inventario con impacto financiero
- `record_inventory_adjustment()` - Registra ajustes por conteo físico
- `get_profit_loss_summary()` - Nuevo endpoint P&L

**Integración automática**:
- `POST /api/business-clarity/invoices` → Crea asiento contable de ingreso
- `POST /api/inventory/ingredients/{id}/adjust` → Crea asiento si hay costo unitario

**Nuevos endpoints**:
- `GET /api/business-clarity/reports/profit-loss` - P&L (Revenue, Payroll, Purchases, Inventory)
- `GET /api/business-clarity/reports/cost-center-actual` - Gastos reales vs presupuesto

**Testing**: Backend 100% - Ver `/app/test_reports/iteration_93.json`

---

#### Auditoría de Permisos Granulares - COMPLETADO ✅

**Funciones de verificación** (`business_clarity.py`):
- `check_edit_permission()` - Roles: owner, admin, finance, editor
- `check_finance_permission()` - Roles: owner, admin, finance
- `check_owner_permission()` - Solo owner

**Endpoints protegidos**:
| Endpoint | Permiso |
|----------|---------|
| `POST /invoices` | editor+ |
| `POST /payments` | finance+ |
| `POST /supplier-payables` | finance+ |
| `POST/PUT/DELETE /fixed-costs/categories` | finance+ |

---

### Session: March 5, 2026

#### Motor de Contabilización (Posting Engine) - COMPLETADO ✅

**Fase 1: PayrollEntry con Cost Center**
- `PayrollEntry` ahora incluye `cost_center_id` y `cost_center_name`
- Hereda automáticamente del `employee.cost_center_id` al crear períodos de nómina
- Los costos de nómina se distribuyen al CC del departamento del empleado (modelo distribuido)

**Fase 2: Motor de Contabilización Centralizado**
- Nueva colección `accounting_entries` para todas las transacciones financieras
- Servicio `AccountingEngine` en `services/accounting_engine.py`
- Tipos de transacción: `payroll`, `expense`, `purchase`, `inventory`, `revenue`
- Subtipos: `salary`, `bonus`, `employer_contribution`, `supplier_payable`, etc.

**Nuevos Endpoints:**
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/business-clarity/accounting/entries` | GET | Lista entradas contables |
| `/api/business-clarity/accounting/unassigned` | GET | Entradas sin CC asignado |
| `/api/business-clarity/accounting/assign-cost-center` | POST | Asignar CC a entrada |
| `/api/business-clarity/accounting/summary` | GET | Resumen por período |
| `/api/business-clarity/accounting/reverse` | POST | Revertir entrada |
| `/api/business-clarity/supplier-payables` | POST | Crear payable con entrada contable |

**Integraciones:**
- Al procesar nómina (`POST /payroll/periods/{id}/process`), crea entradas contables automáticamente
- Al crear supplier_payable vinculado a fixed_cost_category con CC, crea entrada contable

**Fase 3: UI Cola de Asignación**
- Nuevo componente `AccountingQueueSection.js`
- Muestra transacciones pendientes de asignación a CC
- Permite asignar CC desde dropdown
- Accesible desde Reports > "Cola Contable"

**Fase 4: Dashboard Visual de Contabilización** ✅ NEW
- Nuevo endpoint `GET /api/business-clarity/accounting/trends?months=6`
- Componente `AccountingDashboard.js` con gráficos interactivos
- Summary cards: Este Mes, Mes Anterior, Cambio MoM, Total CC
- Gráfico de barras apiladas por Centro de Costo
- Gráfico de línea de tendencia total
- Tarjetas individuales por CC con:
  - Gasto actual vs presupuesto
  - Barra de progreso (rojo si sobre presupuesto)
  - Mini sparkline de tendencia
  - Indicador de cambio porcentual
- Accesible desde Reports > "Contabilización"

**Testing:** 
- Backend: 70% (7/10 tests) - issues menores de naming
- Frontend: 100%
- Ver `/app/test_reports/iteration_91.json`

---

#### Sistema de Alertas Automáticas de Presupuesto - COMPLETADO ✅

**Backend** (`business_clarity.py`):
- Nuevo endpoint `GET /api/business-clarity/budget-alerts`
- Parámetros: `threshold_warning=80`, `threshold_critical=100`
- Calcula utilización de cada Cost Center
- Genera alertas cuando:
  - **Warning** (amarillo): Utilización ≥ 80%
  - **Critical** (rojo): Utilización ≥ 100%

**Frontend** (`BudgetAlertsBell.js`):
- Nuevo componente de campana en el header
- **Se oculta automáticamente** si no hay alertas
- Muestra badge con conteo de alertas
- Dropdown con lista de alertas:
  - Icono por severidad (warning/critical)
  - Nombre y código del Cost Center
  - Barra de progreso de utilización
  - Presupuesto vs Gasto real
  - Monto excedido (si aplica)
- Link para ir al reporte completo

**Comportamiento:**
```
utilization < 80%  → Sin alerta (bell oculto)
utilization ≥ 80%  → Warning (bell amarillo)
utilization ≥ 100% → Critical (bell rojo + badge)
```

**Verificado:**
- Bell se oculta correctamente cuando no hay alertas
- Endpoint retorna alertas ordenadas por severidad

---

#### Presupuestos Editables por Mes/Trimestre/Año - COMPLETADO ✅

**Backend** (`people_ops.py`) - Nuevos endpoints:
- `PUT /api/people-ops/cost-centers/{id}/budget` - Actualiza presupuesto por período
- `GET /api/people-ops/cost-centers/{id}/budgets` - Obtiene todos los presupuestos

**Tipos de presupuesto soportados:**
| Tipo | Campo DB | Cascada |
|------|----------|---------|
| `annual` | `annual_budget` | Distribuye a quarterly y monthly |
| `quarterly` | `quarterly_budgets[2026-Q1]` | Suma a annual, distribuye a monthly |
| `monthly` | `monthly_budgets[2026-03]` | Recalcula quarterly y annual |

**Frontend** (`CostCentersSection.js`) - Mejoras:
- Nuevo botón 📅 para editar presupuesto en la tabla
- Diálogo con tabs: Anual / Trimestral / Mensual
- Selectores de año, trimestre o mes
- Vista de presupuesto actual

**Datos de ejemplo configurados:**
| Cost Center | Presupuesto Anual |
|-------------|-------------------|
| Operaciones | $360,000 |
| Ventas | $300,000 |
| IT | $240,000 |
| Marketing | $180,000 |
| Administración | $144,000 |
| RRHH | $120,000 |
| Instalaciones | $96,000 |
| **TOTAL** | **$1,440,000** |

**Categorías de Fixed Costs vinculadas:**
- Software & Licencias → IT
- Infraestructura Cloud → IT
- Alquiler de Oficina → Instalaciones
- Servicios Públicos → Instalaciones
- Publicidad Digital → Marketing
- Contabilidad & Legal → Administración

---

#### Reporte "By Cost Center" en Executive Reports - COMPLETADO ✅

**Nueva vista añadida a Executive Reports:**

| Vista | Propósito |
|-------|-----------|
| Snapshot | Resumen P&L general |
| By Client | Revenue por cliente |
| By Supplier | Gastos por proveedor |
| By Event | Rentabilidad por evento |
| **By Cost Center** | **P&L por centro de costo (NUEVO)** |
| Assets | Valor de activos |

**Características del reporte "By Cost Center":**
- **4 Cards de resumen**: Total Budget, Actual Spend, Variance, Payroll
- **Tabla Budget vs Actual** con columnas: Cost Center, Budget, Actual, Payroll, Other, Variance, Utilization
- **Barra de utilización visual** (verde/amarillo/rojo)
- **Drilldown a transacciones** al hacer click en una fila
- **Período seleccionable** (mensual)

**Endpoints creados:**
- `GET /api/business-clarity/reports/by-cost-center` - Reporte principal
- `GET /api/business-clarity/reports/cost-center/{id}/transactions` - Detalle de transacciones

**Archivos modificados:**
- `backend/routers/business_clarity.py` - Nuevos endpoints
- `frontend/src/components/business-clarity/ReportsSection.js` - Nueva vista

---

#### Integración Fixed Costs ↔ Cost Centers - COMPLETADO ✅

**Problema resuelto**: Los Fixed Costs y Cost Centers estaban desconectados. Ahora los gastos fijos se reflejan automáticamente en el "Gasto Actual" de los Cost Centers.

**Cambios implementados:**

1. **Backend** (`business_clarity.py`):
   - Añadido campo `cost_center_id` a categorías de Fixed Costs
   - Al crear/editar categoría, se puede vincular a un Cost Center

2. **Backend** (`people_ops.py`):
   - Endpoint `GET /cost-centers` ahora calcula `current_spend` sumando:
     - Payables asignados a categorías de Fixed Costs vinculadas
     - Payables directamente asignados al Cost Center
     - Salarios de empleados en ese Cost Center
   - Calcula automáticamente la `utilization` (% vs presupuesto)

3. **Frontend** (`FixedCostsSection.js`):
   - Nuevo selector "Cost Center (optional)" al crear/editar categoría
   - Tabla de categorías muestra el Cost Center vinculado

**Flujo de datos:**
```
Fixed Cost Category (ej: "Alquiler")
        ↓ linked to
Cost Center (ej: "FAC - Instalaciones")
        ↓ calculates
Gasto Actual = sum(payables + salaries)
Utilización = (Gasto Actual / Presupuesto) × 100%
```

---

#### Generación de Reportes Regulatorios (DGT-3, TSS, IR-17) - COMPLETADO ✅

**Reportes implementados para República Dominicana:**

| Reporte | Entidad | Frecuencia | Contenido |
|---------|---------|------------|-----------|
| **TSS** | Tesorería Seguridad Social | Mensual | Aportes AFP + ARS |
| **DGT-3** | Ministerio de Trabajo | Trimestral | Registro de Personal |
| **IR-17** | DGII | Mensual | Retenciones ISR |
| **606** | DGII | Mensual | Compras de Bienes |

**Mejoras en la descarga de Excel:**
- Formato oficial con cabeceras de la entidad regulatoria
- Datos de la empresa (nombre, RNC) incluidos
- Estilos profesionales (bordes, colores, formatos numéricos)
- Columnas ajustadas automáticamente
- Fila de totales con formato bold

**Archivo modificado:**
- `backend/routers/people_ops.py` - Función `download_regulatory_report()` reescrita

**Verificado:**
- TSS Feb 2026: $15,075.00 (AFP + ARS)
- DGT-3 Q1 2026: $28,116.43 (Total aportes)
- IR-17 Feb 2026: $13,041.43 (ISR retenido)

---

#### Reorganización de People Ops con Dropdowns - COMPLETADO ✅

**Navegación anterior (9 tabs):**
Directory | Payroll | Variable Pay | Time Off | Overtime | Loans | Offboarding | Benefits | Reports | Config

**Nueva navegación con dropdowns (6 elementos):**

| Elemento | Tipo | Opciones |
|----------|------|----------|
| **Directory** | Tab directo | - |
| **Payroll** ▼ | Dropdown | Periods, Variable Pay, Config |
| **Time** ▼ | Dropdown | Time Off, Overtime |
| **Benefits** ▼ | Dropdown | Loans, In-Kind |
| **Offboarding** | Tab directo | - |
| **Reports** | Link externo | → Business Clarity/Regulatory |

**Cambios:**
- De 9 tabs planos → 6 elementos organizados
- Agrupación lógica por funcionalidad
- Consistente con Business Clarity, Settings y Demand Studio
- Mantiene sistema de permisos por rol

**Archivo modificado:**
- `frontend/src/pages/PeopleOpsPage.js`

---

#### Importación Masiva de Inventario con Validación Avanzada - COMPLETADO ✅

**Backend** (`server.py`) - Endpoints:
- `POST /api/inventory/validate-import-file` - **NUEVO**: Valida archivo y retorna preview con estado por fila
- `POST /api/inventory/import-from-file` - Importa inventario desde CSV/Excel
- `GET /api/inventory/import-template` - Descarga plantilla CSV de ejemplo

**Flujo de importación mejorado (3 pasos):**
1. **Paso 1 - Selección**: Usuario selecciona archivo CSV/Excel
2. **Paso 2 - Validación**: Sistema valida cada fila y muestra preview con:
   - Resumen: Total filas, válidas, advertencias, errores
   - Tabla detallada con estado por fila (OK/Warn/Error)
   - Errores específicos por fila (nombre vacío, precio negativo, stock negativo)
   - Advertencias (producto ya existe, categoría desconocida)
3. **Paso 3 - Resultado**: Confirmación con estadísticas de importación

**Validaciones implementadas:**
- Nombre requerido
- Precio no puede ser negativo
- Stock no puede ser negativo
- Detección de productos duplicados (advertencia)
- Normalización de categorías español → inglés
- Normalización de unidades español → inglés

**Características:**
- Soporta archivos CSV y Excel (.xlsx, .xls)
- Mapeo automático de columnas en español e inglés
- Vista previa antes de importar con errores destacados
- Opción para actualizar productos existentes
- Omite filas con errores automáticamente

---

#### Reorganización de Demand Studio con Dropdowns - COMPLETADO ✅

**Nueva estructura de navegación con dropdowns** (consistente con Business Clarity y Settings):

| Elemento | Tipo | Opciones |
|----------|------|----------|
| **Overview** | Tab directo | - |
| **Planning** ▼ | Dropdown | Campaigns, Activations |
| **Channels** ▼ | Dropdown | Social Media, Email Marketing |
| **Notes** | Tab directo | - |
| **Analytics** ▼ | Dropdown | Spend Ledger, Insights |
| **Settings** | Tab directo | - |

**Cambios:**
- De tabs planos → **Dropdowns organizados**
- "Social Media" y "Email Marketing" ahora agrupados bajo "Channels"
- Consistente con el patrón de UI de Business Clarity y Settings
- Dropdown activo se resalta en púrpura (color del módulo)
- Mantiene sistema de permisos por sección

**Archivos modificados:**
- `frontend/src/pages/demand-studio/DemandStudioPage.js` (navegación con DropdownMenu)

---

#### Reorganización de Settings con Dropdowns - COMPLETADO ✅

**Nueva estructura de navegación con dropdowns** (consistente con Business Clarity):

| Dropdown | Opciones |
|----------|----------|
| **Company** ▼ | Branding, Terminology, Templates |
| **Finance** ▼ | Billing, Taxes, Cost Centers |
| **Team** ▼ | Users, Roles |
| **Automation** ▼ | Rules, Integrations |
| **Product** ▼ | Features, Preferences |
| **Growth** ▼ | Lead Forms |
| **Catalogs** ▼ | Service Categories, Item Types, Inventory Categories |
| **Utilities** ▼ | Import/Export, Data Admin |

**Cambios:**
- De 17 tabs planos → **8 dropdowns organizados**
- Consistente con el patrón de UI de Business Clarity
- Dropdown activo se resalta en verde
- Item seleccionado dentro del dropdown también se resalta

**Archivos modificados:**
- `frontend/src/pages/SettingsPage.js` (navegación con DropdownMenu)

#### Mejoras de Inventario para Importación Limpia - COMPLETADO ✅

**Nuevo campo `brand` (marca):**
- Campo añadido al modelo `Ingredient` en backend
- UI con autocomplete: al escribir aparecen las marcas ya usadas en el sistema
- Columna "Brand" visible en la tabla de inventario

**Categorías de inventario dinámicas:**
- 11 categorías predefinidas: Proteins, Dairy, Produce, Dry Goods, Beverages, Spices, Frozen, Canned, Packaging, Cleaning, Other
- Nueva sección en **Settings → "Inventory Cat."** para gestionar categorías
- Crear, editar (nombre ES/EN + color), eliminar categorías
- Las categorías ahora muestran indicador de color en toda la app
- No se puede eliminar una categoría si tiene ingredientes asociados

**Campos adicionales:**
- `sku`: Código interno del producto
- `notes`: Notas adicionales
- `barcode`: Código de barras (preparado para futuro)

**Endpoints nuevos:**
- `GET /api/settings/inventory-categories` - Lista de categorías
- `POST /api/settings/inventory-categories/add` - Crear categoría
- `PUT /api/settings/inventory-categories/{key}` - Editar categoría
- `DELETE /api/settings/inventory-categories/{key}` - Eliminar categoría
- `GET /api/settings/inventory-brands?q=` - Autocomplete de marcas

**Archivos modificados:**
- `backend/server.py` (modelo Ingredient con brand, sku, notes)
- `backend/routers/settings.py` (endpoints de categorías y marcas)
- `frontend/src/pages/FoodOpsPage.js` (UI mejorada con brand y categorías dinámicas)
- `frontend/src/pages/SettingsPage.js` (sección de categorías de inventario)

#### Reportes de Ventas y Administrativos - COMPLETADO ✅

**Backend** (`business_clarity.py`) - Nuevos endpoints:

**Reportes de Ventas:**
- `GET /api/business-clarity/reports/sales/general` - Ventas generales (facturas y devoluciones)
- `GET /api/business-clarity/reports/sales/by-client` - Ventas por cliente
- `GET /api/business-clarity/reports/sales/by-salesperson` - Ventas por vendedor
- `GET /api/business-clarity/reports/sales/by-item` - Ventas por ítem
- `GET /api/business-clarity/reports/sales/item-profitability` - Rentabilidad por ítem
- `GET /api/business-clarity/reports/sales/client-statement/{client_id}` - Estado de cuenta cliente

**Reportes Administrativos:**
- `GET /api/business-clarity/reports/admin/income-expense` - Ingresos y gastos por categoría
- `GET /api/business-clarity/reports/admin/inventory-valuation` - Inventario valorizado
- `GET /api/business-clarity/reports/admin/transactions` - Todas las transacciones (movimientos de dinero)
- `GET /api/business-clarity/reports/admin/purchases` - Compras a proveedores

**Frontend** - Nuevos componentes:
- `SalesReportsSection.js`: UI completa con 6 tipos de reportes de ventas
- `AdminReportsSection.js`: UI completa con 4 tipos de reportes administrativos
- Dropdown "Reports" actualizado con 6 opciones: Executive, Sales, Administrative, Payroll Cost, Marketing ROI, Regulatory

#### Reorganización de navegación Business Clarity - COMPLETADO ✅

**Cambio de UX**:
- Barra de navegación reducida de 12 pestañas a 9 elementos
- Nuevo dropdown **"Reports"** que agrupa:
  - Executive (reportes ejecutivos)
  - Payroll Cost (costo de personal)
  - Marketing ROI
  - Regulatory (reportes regulatorios)
- Pestañas principales: Dashboard, Invoices, Payments, Statements, AR, AP, Fixed Costs, Close
- El dropdown indica visualmente cuando estás en una sección de reportes

**Archivos modificados**:
- `frontend/src/pages/BusinessClarityPage.js` (reorganización con DropdownMenu)

#### P0 - Reportes Regulatorios Configurables por País - COMPLETADO ✅

**Backend** (`settings.py`):
- `GET /api/settings/regulatory-config` - Obtener configuración regulatoria de la organización
- `POST /api/settings/regulatory-config` - Guardar configuración (país, deducciones automáticas)
- `GET /api/settings/available-countries` - Lista de países disponibles (DO, MX, CO, US)
- Configuración completa de reportes por país:
  - **República Dominicana (DO)**: DGT-3, TSS, IR-17, 606
  - **México (MX)**: IMSS, SAT Nómina, INFONAVIT
  - **Colombia (CO)**: PILA, DIAN Retención
  - **Estados Unidos (US)**: Form 941, W-2, Form 940
- Tasas de deducciones de nómina por país (AFP, ARS, IMSS, etc.)

**Frontend** (`RegulatoryReportsSection.js`):
- Reportes dinámicos según país configurado
- Diálogo de configuración de país con:
  - Selector de país de operación
  - Toggle para descuento automático de préstamos
  - Selector de prioridad de deducción (cuota fija vs % salario)
  - Vista previa de reportes disponibles por país
- Indicador del país actual y cantidad de reportes disponibles

#### P1 - Descuento Automático de Préstamos en Nómina - COMPLETADO ✅

**Backend** (`people_ops.py`):
- Lógica mejorada para calcular deducciones de préstamos usando la cuota definida en el préstamo activo
- Al crear período de nómina: se busca el préstamo activo del empleado y se usa su `installment_amount`
- Al procesar nómina:
  - Se actualiza `remaining_balance` del préstamo
  - Se incrementa `total_paid` e `installments_paid`
  - Se marca préstamo como "paid" automáticamente cuando balance llega a 0
  - Se registra cada pago en nueva colección `loan_payments`
- Campo `loan_id` añadido a `payroll_entries` para rastrear el préstamo deducido

#### Reportes Regulatorios movidos a Business Clarity - COMPLETADO ✅

**Cambio de Arquitectura**:
- Los Reportes Regulatorios (DGT-3, TSS, IR-17, 606) se movieron de People Ops a Business Clarity
- Nueva pestaña "Regulatory" en Business Clarity con acceso a todos los reportes
- En People Ops, la pestaña "Reports" ahora es un enlace directo a Business Clarity → Regulatory
- Los endpoints API se mantienen en `/api/people-ops/regulatory-reports` (sin cambios en backend)

**Archivos modificados**:
- `frontend/src/components/business-clarity/RegulatoryReportsSection.js` (movido y mejorado)
- `frontend/src/components/business-clarity/index.js` (añadido export)
- `frontend/src/pages/BusinessClarityPage.js` (añadida ruta /regulatory)
- `frontend/src/pages/PeopleOpsPage.js` (enlace externo a Business Clarity)
- `backend/routers/settings.py` (nuevos endpoints de configuración regulatoria)
- `backend/routers/people_ops.py` (mejora de lógica de préstamos)

### Session: March 4-5, 2026

#### P0 - Widget de Próximos Pagos Variables - COMPLETADO ✅

**Frontend Widget** (`VariablePayWidget.js`):
- Widget en People Ops > Payroll mostrando cards para cada tipo de pago variable
- Muestra: día de pago configurado, monto pendiente (para overtime)
- Lista de runs pendientes con acceso directo a Variable Pay
- Click en cards navega al tab correspondiente

#### P0 - Historial de Pagos por Empleado - COMPLETADO ✅

**Frontend Payment History Tab** (`PaymentHistoryTab.js`):
- Nueva pestaña "Historial Pagos" en el perfil del empleado
- Filtros por año y tipo de pago (Nómina, Overtime, Comisiones, Bonos, Incentivos, Beneficios)
- Cards de resumen con totales por tipo
- Tabla detallada con: Fecha, Tipo, Descripción, Bruto, Deducciones, Neto
- Información adicional según tipo (horas extras, % comisión, % pool, etc.)

**Backend** (`settings.py`):
- `GET /api/settings/employee-payment-history/{employee_id}` - Historial completo
- Agrega datos de: payroll_entries, variable_pay_entries, employee_benefits_log
- Retorna totales acumulados por tipo

#### P0 - Beneficios en Especie (Almuerzo/Catering) - COMPLETADO ✅

**Frontend Benefits Section** (`BenefitsInKindSection.js`):
- Nueva pestaña "Beneficios" en People Ops
- Registro de beneficios en especie: Almuerzo, Transporte, Teléfono, Otro
- Selección múltiple de empleados con "Seleccionar todos"
- Asignación a Cost Center (el costo se registra como gasto)
- Tabla de beneficios recientes

**Backend** (`settings.py`):
- `POST /api/settings/benefits-in-kind` - Registro individual
- `POST /api/settings/benefits-in-kind/bulk` - Registro masivo para múltiples empleados
- `GET /api/settings/benefits-in-kind` - Listado con filtros
- Los beneficios se registran en `employee_benefits_log` y como gasto en `cost_center_expenses`

#### P0 - Sistema Completo de Pagos Variables - COMPLETADO ✅

**Frontend Variable Pay Section** (`VariablePaySection.js`):
- **4 Tabs Separados**: Overtime | Comisiones | Bonos | Incentivos
- Cada tipo con su propio listado, formulario de creación y flujo independiente
- **Overtime Tab**: Calcula pagos basado en horas extras aprobadas en el período
- **Comisiones Tab**: Calcula automáticamente basado en ventas cerradas (eventos Committed/Won asignados al vendedor)
- **Bonos Tab**: Permite asignar montos fijos manualmente a empleados individuales
- **Incentivos Tab**: Distribuye un pool de dinero según el % configurado por empleado
- Vista detallada de cada run con desglose: Empleado, Departamento, Bruto, Deducciones, Neto
- Descarga de archivo bancario CSV para cada run
- Flujo de aprobación: Draft → Pending → Approved → Completed

**Backend Variable Pay** (`settings.py`):
- `GET/POST /api/settings/variable-pay-runs` - CRUD de runs
- `GET /api/settings/variable-pay-runs/{id}` - Detalle con entries
- `PUT /api/settings/variable-pay-entries/{id}` - Editar entrada
- `POST /api/settings/variable-pay-runs/{id}/submit|approve|process|revert` - Workflow
- `GET /api/settings/variable-pay-runs/{id}/bank-file` - CSV bancario
- Lógica de cálculo para cada tipo:
  - **Overtime**: Agrega horas extras aprobadas por empleado
  - **Commission**: Busca eventos cerrados asignados, calcula % sobre total (solo items comisionables)
  - **Bonus**: Crea entries desde lista manual de empleados con montos
  - **Incentive**: Distribuye pool según `incentive_pool_percentage` de cada empleado

**Nuevos Campos en Perfil de Empleado** (`EmployeeProfile.js`, `models/people_ops.py`):
- `commission_rate`: % de comisión sobre ventas para este empleado
- `incentive_pool_percentage`: % de participación en pool de incentivos
- Sección de compensación actualizada para mostrar estos valores

**Campo Comisionable en Tipos de Items** (`SettingsPage.js`, `server.py`):
- `is_commissionable`: boolean en cada item type
- UI en Settings > Tipos de Items con switch Comisionable/No Comisionable
- Items no comisionables se excluyen del cálculo de comisiones

**Asignación de Ventas** (`models/events.py`):
- Campo `assigned_to` en EventUpdate para asignar eventos a vendedores
- Usado para calcular comisiones basadas en ventas cerradas

### Sesiones Anteriores (Marzo 4, 2026)
  - Tasas de AFP (2.87% empleado, 7.10% empleador)
  - Tasas de ARS (3.04% empleado, 7.09% empleador)
  - SRL (1.20%) e INFOTEP (1.0%)
  - Escala ISR 2024 de República Dominicana
  - Tasas de horas extras (35% y 100%)
  - Configuración de Regalía Pascual

- **Integración con Business Clarity** (`PayrollCostSection.js`) - NUEVO:
  - Nueva pestaña "Costo Personal" en Business Clarity
  - KPIs: Empleados Activos, Costo Mensual Empleador, Pagado YTD, Costo Total YTD
  - Lista de nóminas pendientes con acceso directo
  - Gráfico de tendencia de costos mensuales (últimos 6 meses)
  - Desglose: Mes Actual vs Acumulado del Año
  - Backend endpoint: `GET /api/business-clarity/payroll-summary`

- **P&L Completo en Reportes Ejecutivos** - ACTUALIZADO:
  - El reporte "Snapshot" ahora incluye costos de nómina
  - Estructura P&L: Ingresos → Costos Directos → Utilidad Bruta → Costos Fijos → Nómina → **UTILIDAD OPERATIVA**
  - Posición de Caja incluye: Cobrado, Pagado Proveedores, Pagado Nómina, Flujo Neto
  - Detalle de nómina: Bruto, Neto a empleados, Costo total empleador
  - Indicador visual si el costo de nómina es estimado vs real

#### P0 - Fases 2-4 de People Ops - COMPLETADO
- **Time Off / Tiempo y Ausencias** (`TimeOffSection.js`):
  - Solicitudes de vacaciones, licencia médica, permisos personales, maternidad/paternidad
  - Flujo de aprobación: Pendiente → Aprobado/Rechazado
  - Balance de vacaciones por empleado (14 días default RD)
  - Actualización automática de balance al aprobar
  - Endpoints: `GET/POST /api/people-ops/time-off/requests`, `/approve`, `/reject`, `/balances`

- **Loans / Préstamos y Adelantos** (`LoansSection.js`):
  - Préstamos personales, adelantos de salario, préstamos de emergencia/educativos
  - Validación de límite máximo (2x salario mensual para préstamos, 1x para adelantos)
  - Flujo: Pendiente → Aprobado → Activo → Pagado
  - Configuración de cuotas (1-24 períodos)
  - Historial de pagos por préstamo
  - Endpoints: `GET/POST /api/people-ops/loans`, `/approve`, `/reject`, `/payments`

- **Offboarding / Terminaciones** (`OffboardingSection.js`):
  - Tipos: Renuncia, Despido Justificado/Injustificado, Mutuo Acuerdo, Fin de Contrato, Jubilación
  - **Cálculo automático de liquidación según Código de Trabajo RD**:
    - Preaviso (Art. 76): 7-28 días según antigüedad
    - Cesantía (Art. 80): Solo para despido injustificado, máx 630 días
    - Vacaciones no disfrutadas
    - Proporción de Regalía Pascual
    - Salario pendiente
  - Flujo: Borrador → Pendiente Aprobación → Aprobado → Procesado
  - Vista detallada de liquidación con desglose completo
  - Endpoints: `GET/POST /api/people-ops/offboarding`, `/submit`, `/approve`, `/process`

- **Benefits / Compensación** (Backend completo):
  - Beneficios por empleado: Almuerzo, Transporte, Teléfono, Combustible, etc.
  - Frecuencia: Mensual, Quincenal, Diario
  - Indicador si es gravable (ISR) o deducción
  - Resumen de compensación total por empleado
  - Endpoints: `GET/POST /api/people-ops/employees/{id}/benefits`, `/compensation-summary`

---

## Prioritized Backlog

### P0 - Critical
- (Ninguno actualmente - People Ops Fases 1-4 completadas, Reportes Regulatorios por país implementados)

### P1 - Alta Prioridad
1. **Limpiar código de emergencia**: Eliminar `/super-admin/emergency`
2. **Auditoría de permisos granulares**: Revisar endpoints POST/PUT/DELETE

### P2 - Media Prioridad
1. **Archivos redundantes**: Eliminar `CompaniesSection.js` y `backend/routers/companies.py`
2. **Internacionalización**: Completar traducción de strings codificados
3. **Presupuesto LLM**: Recordar al usuario añadir fondos a Emergent LLM Key

### P3 - Baja Prioridad / Futuro
1. Conectar Social Media y Email al Brand Hub
2. Implementar seguimiento completo de UTM
3. Kora Comms - Fase 1 (WhatsApp)
4. Asistente de configuración inicial para nuevos usuarios

---

## Technical Architecture

### Backend
```
/app/backend/
├── server.py              
├── models/
│   ├── people_ops.py       # Employee, PayrollConfig, PayrollPeriod, PayrollEntry, PayslipData
│   └── ...
└── routers/
    ├── people_ops.py       # Employees + Cost Centers + Payroll (640+ lines)
    └── ...
```

### Frontend
```
/app/frontend/src/
├── pages/
│   └── PeopleOpsPage.js    # Main module with tabs
└── components/people-ops/
    ├── EmployeeDirectory.js
    ├── EmployeeProfile.js
    ├── PayrollSection.js
    ├── PayrollPeriodView.js
    ├── PayrollConfigSection.js # Modified - separate variable pay config
    ├── VariablePaySection.js   # NEW - Variable pay runs
    └── index.js
```

### Database Schema (MongoDB)
- **employees**: Personal info, employment, compensation, benefits
- **payroll_config**: Deduction rates, payment frequency, overtime rates
- **payroll_periods**: Period metadata, totals, workflow status
- **payroll_entries**: Individual employee entries per period
- **salary_changes**: History of salary adjustments
- **variable_pay_config**: Configuration for variable pay dates per type (NEW)
- **variable_pay_runs**: Variable pay run periods (NEW)
- **variable_pay_entries**: Individual employee variable pay entries (NEW)

---

## Prioritized Backlog

### P0 - Completado
1. ~~**Implementar lógica de Centros de Costo de extremo a extremo**~~ ✅ DONE
   - Motor de Contabilización centralizado
   - Nómina distribuida a CC del departamento
   - UI para gestionar entradas sin asignar

### P1 - Alta Prioridad
1. **Completar módulos de People Ops (Fases 2, 3, 4)**: Tiempo/Asistencia, Offboarding
2. **Auditoría final de permisos granulares**: Revisar endpoints POST/PUT/DELETE
3. **Agregar soporte para comisiones en Variable Pay Runs**: Solo procesa overtime actualmente

### P2 - Media Prioridad
1. **Archivos redundantes**: Eliminar `CompaniesSection.js` y `backend/routers/companies.py`
2. **Internacionalización**: Completar traducción de strings codificados
3. **Presupuesto LLM**: Recordar al usuario añadir fondos a Emergent LLM Key (Profile > Universal Key)
4. **UI de Beneficios**: Crear componente frontend para gestionar beneficios por empleado

### P3 - Baja Prioridad / Futuro
1. Conectar Social Media y Email al Brand Hub
2. Implementar seguimiento completo de UTM
3. Kora Comms - Fase 1 (WhatsApp)
4. Asistente de configuración inicial para nuevos usuarios

---

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Preview URL
https://culinary-prep-plan.preview.emergentagent.com
