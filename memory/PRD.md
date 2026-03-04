# Kora OS - Product Requirements Document

## Original Problem Statement
Kora OS es una plataforma CRM de marketing y gestión de eventos para agencias creativas. El objetivo principal es proporcionar herramientas integradas para:
- Gestión de clientes y pipeline de ventas (Client Engagement)
- Orquestación de eventos/proyectos (Event Orchestration)  
- Generación de demanda y marketing (Demand Studio)
- Claridad empresarial y análisis (Business Clarity)
- **Gestión de RRHH y Nómina (People Ops)**
- **Sistema de Pagos Variables con 4 tipos independientes**

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
6. **Sistema de pagos variables con 4 flujos independientes: Overtime, Comisiones, Bonos, Incentivos**

---

## What's Been Implemented

### Session: March 4-5, 2026 (ÚLTIMA ACTUALIZACIÓN)

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
- (Ninguno actualmente - People Ops Fases 1-4 completadas)

### P1 - Alta Prioridad
1. **Reportes Regulatorios RD**: DGT-3, TSS, DGII (generación automática)
2. **Descuento automático de préstamos en nómina**: Integrar loans con payroll entries
3. **Limpiar código de emergencia**: Eliminar `/super-admin/emergency`
4. **Auditoría de permisos granulares**

### P2 - Media Prioridad
1. **UI de Beneficios**: Crear componente frontend para gestionar beneficios por empleado
2. **Archivos redundantes**: Eliminar `CompaniesSection.js` y `backend/routers/companies.py`
3. **Internacionalización**: Completar traducción de strings codificados
4. **Presupuesto LLM**: Recordar al usuario añadir fondos a Emergent LLM Key

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

### P1 - Alta Prioridad
1. **Agregar soporte para comisiones en Variable Pay Runs**: Actualmente solo procesa overtime aprobado
2. **Reportes Regulatorios RD**: DGT-3, TSS, DGII (generación automática)
3. **Descuento automático de préstamos en nómina**: Integrar loans con payroll entries

### P2 - Media Prioridad
1. **UI de Beneficios**: Crear componente frontend para gestionar beneficios por empleado
2. **Archivos redundantes**: Eliminar `CompaniesSection.js` y `backend/routers/companies.py`
3. **Internacionalización**: Completar traducción de strings codificados
4. **Presupuesto LLM**: Recordar al usuario añadir fondos a Emergent LLM Key

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
https://variable-pay-config.preview.emergentagent.com
