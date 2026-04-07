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

## Recent Fixes (January 19, 2026)
1. **Critical Bug Fix: Users stuck on Step 1 after booking**
   - **Root Cause**: Inconsistent MongoDB collection naming (`db.progress` vs `db.user_progress`) in the appointment webhook caused step advancement to silently fail
   - **Fix 1**: Corrected `/api/webhook/appointment` to use `db.user_progress` collection
   - **Fix 2**: Added self-healing login flow - users on Step 1 with existing bookings are automatically advanced to Step 2 upon login
   - **Logged as**: `STEP_AUTO_CORRECTED` event in activity logs
2. **Removed obsolete `db.progress` references** - unified on `db.user_progress` throughout codebase

## Recent Fixes (January 13, 2026)
1. **Removed duplicate modal popup** after booking - only shows custom widget success screen now
2. **Fixed Practice Better client ID persistence** - now saved to database, survives browser refresh
3. **Added user-friendly session expiration message** - users see "Your session has expired" instead of silent redirect
4. **Created admin utility script** (`/app/reset_user_step.py`) for testing user journeys
5. **Step 1 static layout** - Both "Action Steps" and "Booking Widget" cards now have a fixed height of 567px (non-responsive)

## Known Issues / Blockers
- **Cloudflare Turnstile "Invalid domain"**: User-side configuration issue (BLOCKED)

## Recent Updates (February 5, 2026)

### Bug Fix: Analytics 500 Error
- **Root Cause**: `NameError: name 'now' is not defined` in `get_realtime_stats()` function
- **Fix**: Changed `now.isoformat()` to `now_pacific.isoformat()` on line 2099 of `server.py`
- **Status**: RESOLVED - Analytics page fully functional

### Bug Fix: Analytics Date Filter Not Persisting
- **Root Cause**: Stale closure in auto-refresh `setInterval` callback - filter values were not being passed correctly
- **Fix**: Refactored `AdminAnalytics.js` to use `useCallback` and `useRef` to maintain current filter values during auto-refresh
- **Status**: RESOLVED - Date filters now persist correctly through auto-refresh cycles

### Features Completed in Previous Session
- **Admin Analytics Page** (`/admin/analytics`) with:
  - Date range filtering
  - "Day 1 Ready" metric (users completing first 2 steps)
  - Staff role exclusion from analytics
  - Fixed "Average Time Between Steps" and "Completion Funnel" metrics
- **Timezone Standardization**: All admin timestamps use Pacific Time (America/Los_Angeles)
- **Intake Form Update**: Added "Current Diagnosis" question
- **UI/UX Fixes**: User details modal restored, staff promotion button added
- **Webhook Centralization**: LeadConnector webhooks moved to backend

## Backlog (Future Tasks)
- P1: Grant Staff Access to Admin Pages (pending user confirmation)
- ~~P1: Add loading/disabled state to "Activate Portal" button~~ Done
- ~~P1: Add "Try Again" button for non-409 booking failures~~ Done
- ~~P0: Fix PB pagination (before_id, 400 handling)~~ Done
- ~~P1: Admin-configurable availability days~~ Done
- P2: Save and show video watch progress
- P2: Send automated email nudges for incomplete steps
- P2: Refactor StepsPage.js into smaller components
- P2: Refactor server.py into smaller routers
- P3: Shareable certificate upon completion
- P3: SMS reminders for consultations
- P3: Offline support / caching
- P3: Multi-language support
- P3: Add font size toggle for 50+ accessibility

## Recent Updates (March 2026)

### Automation Builder Feature
- **New Feature**: Added automation system to forward booking webhook data to external services
- **Location**: `/admin/automations` page (accessible from Activity Logs)
- **Triggers Supported**:
  - `new_booking` - When appointment webhook received at `/api/webhook/appointment`
  - `cancelled_booking` - When cancellation webhook received at `/api/webhook/appointment/cancel`
- **Capabilities**:
  - Create, edit, delete automations
  - Enable/disable automations
  - Test automations with sample data
  - View execution logs with request/response details
- **Backend Endpoints**:
  - `GET /api/admin/automations` - List all automations
  - `POST /api/admin/automations` - Create automation
  - `PUT /api/admin/automations/{id}` - Update automation
  - `DELETE /api/admin/automations/{id}` - Delete automation
  - `POST /api/admin/automations/{id}/test` - Test automation
  - `GET /api/admin/automation-logs` - View execution history
- **Database Collections**: `automations`, `automation_logs`

### SafeSignatureCanvas Component
- **Fix**: Created wrapper component for signature canvas that suppresses iOS in-app browser errors
- **Location**: `/app/frontend/src/components/ui/SafeSignatureCanvas.jsx`
- **Issue Addressed**: PostHog error "undefined is not an object (evaluating 'this._data[this._data.length-1].push')" on Facebook/Instagram iOS browsers

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

## Recent Updates (April 2, 2026)

### Refactoring: Practice Better Service v2 (Code Review)
All 12 items from code review addressed:
1. Auth retries separated from transient retries (`max_auth_retries=1` separate budget)
2. 429 backoff uses config (`retry_429_base_delay`) instead of hardcoded escalation
3. `search_client_by_email` uses `_request` for consistent retry/logging (was raw HTTP)
4. `asyncio.gather` + `Semaphore(3)` for concurrent availability fetching (~1.3s vs ~6s)
5. Idempotency store uses status enum (pending/complete) instead of None sentinel
6. Cache key includes practitioner ID hash
7. `consultant_name` reads actual name (was pulling email)
8. `CacheEntry.data` typed as `Any` (was lowercase `any`)
9. `validate_slot_from_cache` renamed to `slot_in_cache` (advisory, not validation)
10. Duration units documented (TimeSlot=minutes, BookingResult=seconds)
11. Inline imports moved to module level (`get_client_cache`)
12. Thread-safe singleton with `asyncio.Lock` for init
- **Status**: COMPLETE

### Bug Fix: Practice Better 429 Rate Limiting
- **Root Cause**: Aggressive retry strategy (3 retries × short delays × multiple user clicks) exhausted PB rate limits
- **Fixes applied**:
  - Reduced max_retries from 3 to 2, increased base delay from 1s to 2s
  - `_request()` now respects `Retry-After` header on 429 with 10s minimum delay
  - `get_or_create_client()` checks local cache FIRST, then searches PB API on failure before retrying POST
  - New `search_client_by_email()` method searches PB `/consultant/records` endpoint
  - Per-email 30-second cooldown in `booking.py` rejects rapid-fire requests (429 response)
  - Frontend shows 30-second countdown timer after booking error, disables Confirm button and Try Again button during cooldown
- **Status**: RESOLVED

### Bug Fix: User Lookup + Sign in Email
- **Root Causes**: Two bugs in `GET /api/user/lookup`:
  1. FastAPI query param parsing converts `+` to space — fixed by parsing raw query string from `request.url.query`
  2. `+` is a regex quantifier in MongoDB `$regex` — fixed with `re.escape()`
- **Status**: RESOLVED

### Enhancement: Lookup Endpoint Response Cleanup
- Removed `first_name`/`last_name` (null for most users), replaced with `name` field
- Progress now derived from actual `user_progress` step documents (was querying nonexistent fields)
- **Status**: IMPLEMENTED

### Enhancement: Activate Portal Button Loading State
- Added `isActivating` state to Step 3 "Activate Portal" button
- Button shows "Activating..." and becomes disabled during API calls
- **Status**: IMPLEMENTED

### Enhancement: Booking Error "Try Again" Button
- Added "Try Again" button to booking error banner in `OnboardingBooking.jsx`
- Button includes 30-second cooldown after errors to prevent hammering
- **Status**: IMPLEMENTED

## Recent Updates (April 7, 2026)

### Critical Bug Fix: Practice Better Pagination
- **Root Cause**: Two bugs in `search_client_by_email` caused pagination to infinitely loop on the first 100 records:
  1. Parameter name `afterId` (camelCase) was being silently ignored by PB API — should be `after_id` (snake_case)
  2. Using `after_id` (ascending order) when PB returns records in descending order — should use `before_id`
- **Fix**: Changed to `before_id` for correct descending-order pagination, added duplicate ID detection to prevent infinite loops
- **Result**: Full client sync now fetches all 10,000+ PB records (was stuck at 100)
- **Status**: RESOLVED

### Bug Fix: Client Creation 400 Error Handling
- **Root Cause**: `get_or_create_client` only handled 500 errors from PB client creation, but PB returns 400 for duplicate emails
- **Fix**: Now handles 400, 429, and 500 — all trigger fallback search for existing client
- **Status**: RESOLVED

### Feature: Automatic PB→MongoDB Sync
- On server startup: fetches all PB clients to SQLite cache, then syncs `pb_client_record_id` to MongoDB users (matching by email)
- Background task re-syncs every ~2 hours
- Admin endpoints for manual sync and lookup:
  - `GET /api/booking/pb-clients/fetch` — Full PB→MongoDB bulk sync (admin Bearer token)
  - `GET /api/booking/pb-clients/lookup?email=xxx` — Look up specific email in PB, sync to MongoDB (admin Bearer token)
  - `GET /api/booking/cache-lookup?email=xxx` — Check if email exists in local SQLite cache (no auth)
  - `GET /api/booking/cache-status` — Total cached clients and sync status (no auth)

### Feature: Admin-Configurable Availability Days
- **Previously**: Hardcoded to 15 days in `OnboardingBooking.jsx`
- **Now**: Configurable from admin panel via Settings button
- **Backend**: `GET/PUT /api/admin/settings` stores in MongoDB `settings` collection
- **Frontend**: Booking widget fetches setting from `GET /api/settings/public` on load
- **Range**: 1–90 days

## Last Updated
April 7, 2026
