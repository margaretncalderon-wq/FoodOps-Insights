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

---

## Prioritized Backlog

### P0 - Critical
- (Ninguno actualmente - Payroll MVP completado)

### P1 - Alta Prioridad
1. **Completar Fases 2-4 de People Ops**:
   - Tiempo y Asistencia (vacaciones, ausencias, horas)
   - Préstamos y Adelantos (solicitud, aprobación, descuento automático)
   - Offboarding (cálculo de liquidación según leyes RD)
   - Reportes Regulatorios (DGT-3, TSS, DGII)
2. **Limpiar código de emergencia**: Eliminar `/super-admin/emergency`
3. **Auditoría de permisos granulares**

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
https://hr-payslip.preview.emergentagent.com
