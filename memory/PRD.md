# Kora OS - Product Requirements Document

## Overview
Kora OS is a comprehensive business management SaaS for event and hospitality businesses. It connects clients, execution, inventory, marketing, and finance in one unified system.

## Core Modules
1. **System Pulse** - Dashboard overview
2. **Client Engagement** - CRM, leads, proposals
3. **Event Orchestration** - Event planning & execution
4. **Culinary Intelligence** - Recipes, costing, food inventory
5. **Operations Supplies** - Equipment, disposables, event supplies
6. **Demand Studio** - Marketing campaigns, social media
7. **Business Clarity** - Finance, invoices, reports

## Tech Stack
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Auth:** Custom JWT + Google OAuth

## What's Been Implemented

### February 6, 2026
- **UI Consistency Update:** Updated all modules (Business Clarity, Event Orchestration, Culinary Intelligence, Operations Supplies) to have consistent header design with:
  - Gradient icon pills
  - Title + subtitle
  - Horizontal navigation tabs with icons
  
- **Login/Register Redesign:** Modern split-screen design inspired by Monday.com/HoneyBook:
  - Left side: Clean form with Google OAuth + email/password
  - Right side: Kora OS branded illustration (dark graphite with green accents)
  - "Don't have an account? Create one" / "Already have account? Log in" links

- **Landing Page Redesign:**
  - Video hero section with play button
  - Compact module highlights with tabs (Demand Studio first)
  - Stats bar
  - Simplified pricing cards
  - Less text, more visual

### Previous Sessions
- Full Kora OS rebranding (dark graphite #2A2F3A, Kora Green #AED768)
- Google Auth security fix (new users go to registration flow)
- Welcome email integration with Resend (pending API key)
- Backend refactoring: CRM and Events models extracted from server.py
- Custom favicon and logo

## Pending Issues
- **P1:** Local DB data not persisted (workaround in dependencies.py)
- **P2:** Admin subdomain (admin.ourkora.com) SSL configuration

## Upcoming Tasks
- Continue backend refactoring (Phase 8: Extract Events Router)
- Social Media Campaign Widget
- Activate welcome emails (needs RESEND_API_KEY)

## Integrations
- **Stripe:** Payment processing
- **Google OAuth:** Social login
- **Resend:** Transactional emails (pending API key)

## Credentials
- Email: margaret.n.calderon@gmail.com
- Password: Evoque2024!

## URLs
- Preview: https://koraos-saas.preview.emergentagent.com
- Production: https://ourkora.com
