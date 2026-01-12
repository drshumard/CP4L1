# Ray's Quick Reference Guide

This document contains quick configuration changes for common requests.

---

## Booking Calendar - Limit Availability Date Range

**File:** `/app/frontend/src/components/OnboardingBooking.jsx`

**Line ~345:** Look for `AVAILABILITY_DAYS`

```javascript
// Configuration for availability window
// Set to null to show ALL available dates, or a number to limit (e.g., 14 for 2 weeks)
const AVAILABILITY_DAYS = null; // null = show all dates
```

### To limit to 14 days (2 weeks):
```javascript
const AVAILABILITY_DAYS = 14;
```

### To limit to 30 days (1 month):
```javascript
const AVAILABILITY_DAYS = 30;
```

### To show ALL available dates (current setting):
```javascript
const AVAILABILITY_DAYS = null;
```

**Note:** The Practice Better API returns all future availability regardless of the `days` parameter. This setting filters on the frontend to limit what users see.

---

## Booking Calendar - Change Header Text

**File:** `/app/frontend/src/components/OnboardingBooking.jsx`

**Line ~545:** Look for `headerTitle`

```javascript
{step === 'select-date' && 'Step 1: Book Your One-On-One Consult'}
```

Change the text in quotes to update the header.

---

## Booking Calendar - Availability Polling Interval

**File:** `/app/frontend/src/components/OnboardingBooking.jsx`

**Line ~338:** Look for `refetchInterval`

```javascript
refetchInterval: shouldPoll ? 60 * 1000 : false, // 60 seconds = 1 minute
```

### To change to 5 minutes:
```javascript
refetchInterval: shouldPoll ? 5 * 60 * 1000 : false, // 5 minutes
```

---

## Backend - Availability Cache TTL

**File:** `/app/backend/booking.py`

The backend now has **background cache refresh** that pre-populates availability data on server startup. Users see cached data instantly - no "Fetching availability" wait.

**Environment variables:**

```bash
# Cache TTL in seconds (default: 300 = 5 minutes)
AVAILABILITY_CACHE_TTL=300

# Background refresh interval in seconds (default: 300 = 5 minutes)  
BACKGROUND_REFRESH_INTERVAL=300
```

**API Rate Limit Calculation:**
- Daily limit: 10,000 calls
- Refresh every 5 min = 288 refreshes/day
- 6 practitioners × 288 = 1,728 calls/day for caching
- Leaves ~8,272 calls for actual bookings

**How it works:**
1. Server starts → Background task fetches availability immediately
2. Data is cached for 5 minutes
3. Background task refreshes cache every 5 minutes
4. User requests get instant response from cache
5. If cache miss (rare), fetches fresh and starts background task

---

## Backend - Practitioner IDs Filter

**File:** `/app/backend/.env`

```bash
PRACTICE_BETTER_PRACTITIONER_IDS=id1,id2,id3,id4,id5,id6
```

Set to empty to show ALL practitioners:
```bash
PRACTICE_BETTER_PRACTITIONER_IDS=
```

---

## Practice Better API Credentials

**File:** `/app/backend/.env`

```bash
PRACTICE_BETTER_CLIENT_ID=pb_xxxxx
PRACTICE_BETTER_CLIENT_SECRET=xxxxx
PRACTICE_BETTER_SERVICE_ID=xxxxx
PRACTICE_BETTER_SESSION_DURATION=30
PRACTICE_BETTER_SESSION_TYPE=virtual
```
