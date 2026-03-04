# Kora OS - Product Requirements Document

## Original Problem Statement
Kora OS es una plataforma CRM de marketing y gestión de eventos para agencias creativas. El objetivo principal es proporcionar herramientas integradas para:
- Gestión de clientes y pipeline de ventas (Client Engagement)
- Orquestación de eventos/proyectos (Event Orchestration)  
- Generación de demanda y marketing (Demand Studio)
- Claridad empresarial y análisis (Business Clarity)

## User Personas
- **Agencias de Marketing/Eventos**: Usuarios principales que gestionan múltiples clientes y proyectos
- **Colaboradores**: Miembros de equipo con acceso limitado a ciertas organizaciones
- **Super Admins**: Administradores con acceso a herramientas de gestión avanzadas

## Core Requirements
1. Sistema multi-organización con selector de empresa
2. Permisos granulares por sección (campañas, social media, etc.)
3. Filtrado de datos por organización seleccionada
4. Vinculación bidireccional entre módulos

---

## What's Been Implemented

### Session: March 4, 2026

#### P0 - Producción (RESUELTO)
- **Herramienta de Restauración de Emergencia**: Creada y usada exitosamente para reparar `company_id` y membresías corruptas
- **Eliminación de OrgSwitcher**: Componente defectuoso eliminado completamente para prevenir recurrencia del bug

#### P1 - Funcionalidades Core
- **Filtrado por Organización**: Todos los módulos de Demand Studio (Campañas, Estadísticas, Gastos, Activaciones, Notas) y Social Media respetan el selector de organización global
- **Permisos Granulares**: Backend y frontend implementados para soportar permisos por sección (ej. `campaigns: "viewer"`)

#### P1 - Vinculación Activation-Event (COMPLETADO)
- **Backend Endpoints**:
  - `GET /api/demand-studio/activations/{id}/linkable-events` - Lista eventos con estado de confirmación
  - `GET /api/demand-studio/activations/{id}/linked-event-details` - Detalles completos del evento vinculado
  - `GET /api/demand-studio/events/{eventId}/linked-activation` - Activation vinculada a un evento
- **Frontend - ActivationsPage**:
  - Drawer con resumen completo del evento vinculado
  - Navegación condicional (Event Orchestration vs Event Details)
  - Indicadores visuales de estado (Confirmado/En Proceso)
  - Diálogo de selección mejorado con badges de estado

#### P1 - Cost Center / Eventos Internos (NUEVO - COMPLETADO)
- **Backend Endpoints**:
  - `GET /api/demand-studio/internal-cost-center` - Obtiene/crea cliente interno "Marketing Interno - {Org}"
  - `POST /api/demand-studio/activations/{id}/create-internal-event` - Crea evento interno vinculado
- **Frontend - ActivationsPage**:
  - Botón "Create Internal Event (Cost Center)" en diálogo de linkeo
  - Formulario pre-llenado con datos de la activation
  - Banner informativo de Cost Center
- **Lógica**:
  - Cliente interno con `is_internal_cost_center=true`
  - Eventos internos con `is_internal_event=true` y `stage='Committed'`
  - Aparecen directamente en Event Orchestration
  - Separación contable de gastos internos vs clientes externos

---

## Prioritized Backlog

### P0 - Critical
- (Ninguno actualmente)

### P1 - Alta Prioridad
1. **Limpiar código de emergencia**: Eliminar `/super-admin/emergency` y `backend/routers/emergency_restore.py`
2. **Auditoría de permisos granulares**: Verificar todos los endpoints POST/PUT/DELETE para roles de editor/admin

### P2 - Media Prioridad
1. **Archivos redundantes**: Eliminar `CompaniesSection.js` y `backend/routers/companies.py`
2. **Internacionalización**: Completar traducción de strings codificados
3. **Presupuesto LLM**: Recordar al usuario añadir fondos a Emergent LLM Key para funciones IA
4. **Dashboard de Marketing Interno**: Reportes de ROI del Cost Center

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
├── server.py              # FastAPI main + routes
├── models/
│   ├── crm.py             # Client con is_internal_cost_center
│   ├── demand_studio.py   # MarketingActivation con linked_event_id
│   └── events.py          # Event con linked_activation_id, is_internal_event
└── routers/
    ├── demand_studio.py   # CRUD + event linking + internal cost center
    └── emergency_restore.py # (A ELIMINAR)
```

### Frontend
```
/app/frontend/src/
├── pages/
│   ├── demand-studio/
│   │   └── ActivationsPage.js  # Drawer, linkeo, crear evento interno
│   ├── EventOrchestrationPage.js # Banner de activation
│   └── super-admin/
│       └── EmergencyRestorePage.js # (A ELIMINAR)
└── components/ui/
    └── sheet.jsx           # Componente drawer usado
```

### Database Schema (MongoDB)
- **clients**: `is_internal_cost_center: bool` para identificar Cost Centers
- **marketing_activations**: `linked_event_id`, `linked_event_name`
- **events**: `linked_activation_id`, `linked_activation_name`, `is_internal_event`, `marketing_budget`
- **memberships**: Campo `permissions` para acceso granular

---

## Test Credentials
- **Email**: demo.agency@kora.com
- **Password**: Evoque2024!

## Preview URL
https://hr-payslip.preview.emergentagent.com
