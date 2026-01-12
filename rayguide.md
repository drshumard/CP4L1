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

**File:** `/app/backend/services/practice_better_v2.py`

**Line ~395:** In `PracticeBetterService.__init__`

```python
self._availability_cache = AvailabilityCache(ttl=config.availability_cache_ttl)
```

Default is 60 seconds. To change, set environment variable:

```bash
PRACTICE_BETTER_CACHE_TTL=300  # 5 minutes
```

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
