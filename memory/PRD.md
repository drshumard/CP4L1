# Dr. Shumard Onboarding Portal - Product Requirements Document

## Original Problem Statement
Build a comprehensive multi-step onboarding portal for Dr. Shumard's wellness program. The portal guides new users through:
1. **Step 1**: Watch educational video + Book a consultation
2. **Step 2**: Complete detailed health intake form (3 parts)
3. **Step 3**: Final onboarding completion

## Core Features Implemented

### User Authentication & Sessions
- [x] Email/password login with JWT tokens (24-hour session duration)
- [x] Password reset functionality
- [x] Admin authentication
- [x] "Refunded" user status (step 0) - locks user to repurchase page

### Step 1: Video + Booking
- [x] Educational video display (with mobile-specific views)
- [x] **NEW: Custom Booking Calendar** (replaced Practice Better iframe)
  - Practice Better API integration via `/company/administration/members` and `/consultant/availability/slots`
  - 6 configured practitioners with availability
  - React Query for data fetching with 60s cache
  - Calendar view showing dates with availability
  - Time slot selection with booking form
  - Pre-populated user information
- [x] Backend webhook from Practice Better for step advancement
- [x] Frontend polling for seamless step transitions
- [x] Manual "I've Booked My Call" fallback button
- [x] LeadConnector webhook on step completion
- [x] ROACH checkpoint: Old Practice Better iframe preserved in comments for rollback

### Step 2: Intake Form
- [x] Part 1: Diabetes Profile (personal info, health history, symptoms)
- [x] Part 2: HIPAA Notice of Privacy (consent + signature)
- [x] Part 3: Telehealth Consent (consent + signature)
- [x] Auto-save functionality
- [x] PDF generation with cloud storage (Dropbox + Google Drive)
- [x] **Required address fields** (Street, City, Country, State, Postal Code)
- [x] State dropdown for US addresses
- [x] Validation modal for missing required fields

### Step 3: Completion
- [x] Final step confirmation

### Admin Dashboard
- [x] Table-based user management layout
- [x] Horizontal bar chart for step distribution
- [x] User search and filtering
- [x] Ability to set user to "Refunded" status
- [x] Resend welcome emails

### Email System
- [x] Welcome emails (simplified, accessible design)
- [x] "Resend welcome" emails
- [x] Admin notifications for repurchases

### Analytics
- [x] PostHog integration (identifies users by email)

## Technical Architecture

### Frontend (React)
- `/app/frontend/src/pages/StepsPage.js` - Main step navigation
- `/app/frontend/src/components/IntakeForm.js` - Form container with validation
- `/app/frontend/src/components/intake-form/` - Form parts
- `/app/frontend/src/pages/AdminDashboard.js` - Admin interface
- `/app/frontend/src/pages/RefundedPage.js` - Refunded user page

### Backend (FastAPI)
- `/app/backend/server.py` - All API endpoints
- Key endpoints:
  - `POST /api/webhook/appointment` - Practice Better webhook
  - `POST /api/auth/signup`, `/api/auth/login`
  - `POST /api/admin/user/{id}/set-step`

### Database (MongoDB)
- `users` collection with `current_step` field (0=Refunded, 1-3=Active steps)

## Known Issues / Blockers
- **Cloudflare Turnstile "Invalid domain"**: User-side configuration issue

## Backlog (Future Tasks)
- P2: Save and show video watch progress
- P2: Send automated email nudges for incomplete steps
- P2: Enhanced Analytics (video completion, time on steps)
- P3: Shareable certificate upon completion
- P3: SMS reminders for consultations
- P3: Offline support / caching
- P3: Multi-language support

## Test Credentials
- User: `raymond@fireside360.co.uk` / `akosua1001`
- Admin: `testadmin@test.com` / `test123`

## Last Updated
January 2026 - Added required validation for address fields in intake form
