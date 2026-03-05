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

---

## What's Been Implemented

### Session: March 5, 2026 (ÚLTIMA ACTUALIZACIÓN)

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
https://cost-center-hub.preview.emergentagent.com
