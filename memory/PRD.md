# Dr. Shumard Onboarding Portal - Product Requirements Document

## Original Problem Statement
Build a comprehensive multi-step onboarding portal for Dr. Shumard's wellness program. The portal guides new users through:
1. **Step 1**: Watch educational video + Book a consultation
2. **Step 2**: Complete detailed health intake form (3 parts)
3. **Step 3**: Final onboarding completion + Portal activation

## Core Features Implemented

### User Authentication & Sessions
- [x] Email/password login with JWT tokens (24-hour session duration)
- [x] Password reset functionality
- [x] Admin authentication
- [x] "Refunded" user status (step 0) - locks user to repurchase page
- [x] User-friendly session expiration message
- [x] **Logout confirmation dialog** - Prevents accidental logouts
- [x] **Session expiration warning** - Shows modal 30s before expiry with countdown timer, option to renew or logout

### Step 1: Video + Booking
- [x] Educational video display (with mobile-specific views)
- [x] **Custom Booking Calendar** (replaced Practice Better iframe)
  - Practice Better API integration via `/company/administration/members` and `/consultant/availability/slots`
  - 6 configured practitioners with availability
  - React Query for data fetching with 60s cache
  - Server-side caching (2-min TTL) for instant UI loads
  - Calendar view showing dates with availability
  - Time slot selection with booking form
  - **Pre-populated user information including phone number**
  - Auto-redirect to Step 2 after successful booking (5-sec countdown)
- [x] Backend webhook from Practice Better for step advancement
- [x] Frontend polling for seamless step transitions
- [x] Manual "I've Booked My Call" fallback button
- [x] LeadConnector webhook on step completion
- [x] **Practice Better client record ID persisted to database** (survives browser refresh)
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
- [x] Final step confirmation with video
- [x] "Activate Practice Better Portal" button (uses persisted client record ID)
- [x] Action steps for calendar confirmation and support team

### Admin Dashboard
- [x] Table-based user management layout
- [x] Horizontal bar chart for step distribution
- [x] User search and filtering
- [x] Ability to set user to "Refunded" status
- [x] Ability to set user to specific step (admin script)
- [x] Resend welcome emails

### Email System
- [x] Welcome emails (simplified, accessible design)
- [x] "Resend welcome" emails
- [x] Admin notifications for repurchases

### Analytics
- [x] PostHog integration (identifies users by email)

## Technical Architecture

### Frontend (React)
- `/app/frontend/src/pages/StepsPage.js` - Main step navigation (1600+ lines, needs refactoring)
- `/app/frontend/src/components/OnboardingBooking.jsx` - Custom booking widget
- `/app/frontend/src/hooks/useBooking.js` - React Query hooks for booking
- `/app/frontend/src/components/IntakeForm.js` - Form container with validation
- `/app/frontend/src/components/intake-form/` - Form parts
- `/app/frontend/src/pages/AdminDashboard.js` - Admin interface
- `/app/frontend/src/pages/RefundedPage.js` - Refunded user page

### Backend (FastAPI)
- `/app/backend/server.py` - All API endpoints
- `/app/backend/booking.py` - Booking API router with Practice Better integration
- `/app/backend/services/practice_better_v2.py` - Practice Better API service
- Key endpoints:
  - `POST /api/webhook/appointment` - Practice Better webhook
  - `POST /api/auth/signup`, `/api/auth/login`
  - `POST /api/admin/user/{id}/set-step`
  - `GET /api/booking/availability` - Cached availability
  - `POST /api/booking/book` - Book session
  - `POST /api/user/save-pb-client` - Persist PB client ID

### Database (MongoDB)
- `users` collection with `current_step` field (0=Refunded, 1-3=Active steps)
- `users.pb_client_record_id` - Practice Better client ID (for portal activation)

## Recent Fixes (January 13, 2026)
1. **Removed duplicate modal popup** after booking - only shows custom widget success screen now
2. **Fixed Practice Better client ID persistence** - now saved to database, survives browser refresh
3. **Added user-friendly session expiration message** - users see "Your session has expired" instead of silent redirect
4. **Created admin utility script** (`/app/reset_user_step.py`) for testing user journeys
5. **Step 1 static layout** - Both "Action Steps" and "Booking Widget" cards now have a fixed height of 567px (non-responsive)

## Known Issues / Blockers
- **Cloudflare Turnstile "Invalid domain"**: User-side configuration issue (BLOCKED)

## Backlog (Future Tasks)
- P1: Verify Step 3 "Activate Portal" button works end-to-end
- P2: Save and show video watch progress
- P2: Send automated email nudges for incomplete steps
- P2: Enhanced Analytics (video completion, time on steps)
- P2: Refactor StepsPage.js into smaller components
- P3: Shareable certificate upon completion
- P3: SMS reminders for consultations
- P3: Offline support / caching
- P3: Multi-language support
- P3: Add font size toggle for 50+ accessibility

## Test Credentials
- User: `raymond@fireside360.co.uk` / `akosua1001`
- Admin: `testadmin@test.com` / `test123`
- New test users: `ray+<number>@fireside360.co.uk` with password `Test123!`

## API Endpoints (Custom Booking)
- `GET /api/booking/health` - Health check, returns Practice Better connection status
- `GET /api/booking/availability?start_date=YYYY-MM-DD&days=14` - Get available slots
- `GET /api/booking/availability/{date}` - Get slots for specific date
- `POST /api/booking/book` - Book a session
- `GET /api/booking/cache-status` - Cache status info
- `POST /api/user/save-pb-client` - Save Practice Better client ID to user record

## Codebase Review
See `/app/memory/CODEBASE_REVIEW.md` for detailed analysis of potential failure points for 50+ non-tech-savvy users.

## Last Updated
January 13, 2026 - Step 1 static layout with fixed 567px height cards
