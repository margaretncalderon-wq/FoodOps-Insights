# Kora OS - Product Requirements Document

## Original Problem Statement
Kora OS es una plataforma CRM de marketing y gestión de eventos para agencias creativas. El objetivo principal es proporcionar herramientas integradas para:
- Gestión de clientes y pipeline de ventas (Client Engagement)
- Orquestación de eventos/proyectos (Event Orchestration)  
- Generación de demanda y marketing (Demand Studio)
- Claridad empresarial y análisis (Business Clarity)
- **Gestión de RRHH y Nómina (People Ops)** - NUEVO

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
5. **Sistema de nómina completo con cálculos legales de RD**

---

## What's Been Implemented

### Session: March 4, 2026 (Continued)

#### P0 - Módulo de Nómina (Payroll) - COMPLETADO
- **Frontend Payroll Dashboard** (`PayrollSection.js`):
  - Vista de historial de nóminas con tabla paginada
  - Tarjetas de resumen (Período Activo, Nóminas del Año, Pagado, Frecuencia)
  - Diálogo de creación de nuevo período con auto-llenado de fechas
  - Navegación a detalle de período
  
- **Frontend Period Detail View** (`PayrollPeriodView.js`):
  - Tabla detallada de empleados con columnas: Salario Base, Horas Extra, Bonos, Bruto, AFP, ARS, ISR, Neto
  - Edición inline de horas extra, bonos y deducciones
  - Flujo de workflow: Borrador → Enviar a Aprobación → Aprobar → Procesar
  - Vista e impresión de recibo de pago (Payslip)
  - Descarga de archivo bancario (CSV)
  
- **Frontend Payroll Config** (`PayrollConfigSection.js`):
  - Configuración de frecuencia de pago (quincenal/mensual)
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

- **Backend (ya existente)** (`people_ops.py` lines 642-1319):
  - `GET /api/people-ops/payroll/config` - Configuración de nómina
  - `POST /api/people-ops/payroll/config` - Guardar configuración
  - `GET/POST /api/people-ops/payroll/periods` - CRUD de períodos
  - `PUT /api/people-ops/payroll/entries/{id}` - Editar entradas con recálculo automático
  - `POST /api/people-ops/payroll/periods/{id}/submit|approve|process|revert` - Workflow
  - `GET /api/people-ops/payroll/entries/{id}/payslip` - Datos de recibo
  - `GET /api/people-ops/payroll/periods/{id}/bank-file` - Archivo bancario CSV

### Sesiones Anteriores
- **Vinculación Activation-Event**: Completado
- **Cost Center / Eventos Internos**: Completado
- **Marketing ROI Dashboard**: Completado
- **Directorio de Empleados**: Completado

### Session: March 4, 2026 (Continued)

#### P0 - Módulo de Nómina (Payroll) - COMPLETADO
- **Frontend Payroll Dashboard** (`PayrollSection.js`):
  - Vista de historial de nóminas con tabla paginada
  - Tarjetas de resumen (Período Activo, Nóminas del Año, Pagado, Frecuencia)
  - Diálogo de creación de nuevo período con auto-llenado de fechas
  - Navegación a detalle de período
  
- **Frontend Period Detail View** (`PayrollPeriodView.js`):
  - Tabla detallada de empleados con columnas: Salario Base, Horas Extra, Bonos, Bruto, AFP, ARS, ISR, Neto
  - Edición inline de horas extra, bonos y deducciones
  - Flujo de workflow: Borrador → Enviar a Aprobación → Aprobar → Procesar
  - Vista e impresión de recibo de pago (Payslip)
  - Descarga de archivo bancario (CSV)
  
- **Frontend Payroll Config** (`PayrollConfigSection.js`):
  - Configuración de frecuencia de pago (quincenal/mensual)
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
│   └── PeopleOpsPage.js    # Main module with tabs (Directory, Payroll, Config)
└── components/people-ops/
    ├── EmployeeDirectory.js
    ├── EmployeeProfile.js
    ├── PayrollSection.js    # NEW - Payroll dashboard
    ├── PayrollPeriodView.js # NEW - Period detail & workflow
    ├── PayrollConfigSection.js # NEW - Deduction rates config
    └── index.js
```

### Database Schema (MongoDB)
- **employees**: Personal info, employment, compensation, benefits
- **payroll_config**: Deduction rates, payment frequency, overtime rates
- **payroll_periods**: Period metadata, totals, workflow status
- **payroll_entries**: Individual employee entries per period
- **salary_changes**: History of salary adjustments

---

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Preview URL
https://variable-pay-config.preview.emergentagent.com
