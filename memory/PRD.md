# Kora OS - Product Requirements Document

## Original Problem Statement
Crear una plataforma CRM y de marketing multitenant "Kora OS" para gestión de clientes, campañas, y operaciones de catering/eventos.

## Current Status: CRITICAL BUG FIX IN PROGRESS

### Critical Issue (P0)
- **Bug:** El conmutador de organización heredado (`OrgSwitcher.js`) cambió incorrectamente el `company_id` de la usuaria `margaret.n.calderon@gmail.com` en la base de datos de PRODUCCIÓN
- **Impact:** La usuaria ve datos de CRM de otra empresa ("Staffdo") en lugar de los suyos
- **Status:** PARCHEADO en código, necesita despliegue a producción

### Emergency Restore Tool (Completed - 2024-03-04)
- ✅ Backend endpoints `/api/emergency/*` creados
- ✅ Frontend page `/emergency-restore` creada
- ✅ Funcionalidad para restaurar usuarios individuales
- ✅ Funcionalidad para restaurar todos los usuarios de una empresa

---

## Completed Features

### Phase 1: Core CRM (Complete)
- Lead management
- Client management
- Contact management
- Lead forms with webhook integration

### Phase 2: Demand Studio (Complete)
- Campaign management
- Social media management
- Content calendar
- Spend ledger
- Email marketing (basic)

### Phase 3: Multi-tenant Refactoring (Mostly Complete)
- ✅ Account-centric sharing for Social Media
- ✅ Global company switcher in Demand Studio
- ✅ Granular permissions UI (ShareCompanyDialog)
- ⏳ Granular permissions backend enforcement (pending)

### Phase 4: Emergency Fix (In Progress)
- ✅ Security patch for `/api/org/switch`
- ✅ Emergency restore endpoints
- ✅ Emergency restore frontend page
- ⏳ Production deployment needed

---

## Pending Tasks

### P0 - Critical (Must Fix Now)
1. Deploy emergency restore tool to production
2. User must restore her account via `/emergency-restore`
3. Restore Staffdo users visibility

### P1 - High Priority
1. Remove `OrgSwitcher.js` component (caused the bug)
2. Clean up emergency router after all users restored
3. Complete granular permissions backend enforcement

### P2 - Medium Priority
1. Connect Social + Email to Brand Hub
2. Complete UTM tracking
3. Clean up redundant files (old CompaniesSection.js)

### P3 - Low Priority / Backlog
1. Kora Comms - WhatsApp integration
2. Full Meta API write access
3. Email marketing with Resend
4. Initial setup wizard for new users

---

## Technical Architecture

### Backend Structure
```
/app/backend/
├── server.py (main FastAPI app)
├── config.py (environment variables)
├── routers/
│   ├── auth.py
│   ├── crm.py
│   ├── demand_studio.py
│   ├── emergency_restore.py  # NEW - for production fix
│   ├── company_sharing.py
│   └── ... (other routers)
└── models/
```

### Frontend Structure
```
/app/frontend/src/
├── pages/
│   ├── EmergencyRestorePage.js  # NEW
│   ├── demand-studio/
│   └── ...
├── components/
│   ├── OrgSwitcher.js  # TO BE REMOVED
│   └── ...
└── contexts/
    └── CompanyContext.js
```

### Database (MongoDB)
- Key collections: users, companies, memberships, leads, clients, etc.
- Critical field: `users.company_id` - determines which company's data user sees

---

## 3rd Party Integrations
- **Stripe:** Payment processing
- **Meta/Instagram:** OAuth for social media (read-only)
- **Zapier/Make:** Webhook for lead ingestion
- **Emergent LLM Key:** AI features (budget exhausted)

---

## Test Credentials
- Email: `demo.agency@kora.com`
- Password: `Evoque2024!`

---

## Known Issues
1. Emergent LLM key budget exhausted - AI features won't work
2. Some strings not internationalized
3. Redundant files exist (old implementations)

---

Last Updated: 2024-03-04
