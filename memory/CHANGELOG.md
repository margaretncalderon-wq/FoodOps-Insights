# Kora OS - Changelog

## March 4, 2026

### Session 2: People Ops + Cost Centers

#### New Module: People Ops
- Created new sidebar module "People Ops" for team management and payroll
- **Employee Directory**:
  - List view with search and filters (status, department)
  - Stats cards: Total, Active, On Leave, Departments
  - Create new employee with full form
- **Employee Profile**:
  - Tabs: Info, Compensation, Documents, Time
  - Personal information section
  - Employment info with cost center assignment
  - Salary history tracking
  - Benefits (AFP, ARS) display
- **Permissions**:
  - Full access: owner, admin, hr
  - Limited: manager (view team only)
  - Self-service: employee (view own profile)

#### Cost Centers
- CRUD operations for cost centers
- 7 predefined templates: Marketing, Admin, IT, RRHH, Operaciones, Ventas, Instalaciones
- Budget tracking with utilization indicators
- Link employees to cost centers

#### Reference Data (Dominican Republic)
- AFP Providers: Popular, Reservas, Siembra, Crecer, Romana
- ARS Providers: Humano, Universal, Palic, Semma, Meta Salud, Monumental, SeNaSa
- Banks: Popular, Reservas, BHD León, Scotiabank, Santa Cruz, Promerica, etc.

### Session 1: Marketing ROI + Activation-Event Linking

#### Marketing ROI Dashboard (Business Clarity)
- New tab "Marketing ROI" in Business Clarity
- KPIs: Total Investment, ROI%, Leads Generated, Conversions
- Performance by Activation table
- Cost Center breakdown
- Lead attribution tracking

#### Activation-Event Bidirectional Linking
- Link activations to events with drawer details
- Conditional navigation (Orchestration vs Event Details)
- Visual status badges (Confirmed/In Progress)
- Banner in Event Orchestration showing linked activation

#### Internal Events / Cost Center
- Create internal marketing events directly from Activations
- Auto-create "Marketing Interno" cost center client
- Events created with stage='Committed' for immediate orchestration access

### Previous Session: Production Fix

#### Critical Production Issue (RESOLVED)
- Emergency restore tool created and used to fix corrupted company_id
- OrgSwitcher component removed to prevent recurrence
- User memberships repaired

#### Organization Filtering
- All Demand Studio modules respect global org selector
- Granular permissions implemented for section-level access
