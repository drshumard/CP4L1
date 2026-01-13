# Potential Failure Points & Edge Cases Analysis

## 🔴 CRITICAL - Will Block User Journey

### 1. Practice Better Client ID Not Saved After Booking
**Location:** `StepsPage.js` lines 1191-1196, `booking.py`
**Scenario:** User completes booking but `savePbClientRecordId()` fails silently
**Impact:** User reaches Step 3 but "Activate Portal" button opens generic URL instead of personalized activation link
**Fix needed:** Make the save call blocking or show error if it fails

### 2. Booking API Fails - No Retry Mechanism
**Location:** `OnboardingBooking.jsx`, `booking.py`
**Scenario:** Practice Better API is temporarily down or times out
**Impact:** User sees error, may think their booking failed when it actually went through (or vice versa)
**Current state:** Shows toast error but no retry button
**Fix needed:** Add retry button, show clearer error messages

### 3. Step Advancement Race Condition
**Location:** `StepsPage.js` lines 1220-1240
**Scenario:** User books successfully, `onBookingSuccess` fires but API call to `/user/advance-step` fails
**Impact:** User sees success screen but is stuck on Step 1 after refresh
**Current state:** Error is only logged to console
**Fix needed:** Show error toast and add manual "Continue to Step 2" button

### 4. Intake Form PDF Generation Fails
**Location:** `server.py` line 1357-1373
**Scenario:** PDF generation or cloud upload fails
**Impact:** User submits form, gets success message, but PDFs are never saved
**Current state:** Errors are logged but user sees success
**Fix needed:** Either make it blocking with retry, or clearly mark as "processing"

---

## 🟡 MEDIUM - May Cause Confusion or Require Manual Intervention

### 5. Token Refresh Fails Silently During Long Form Fill
**Location:** `StepsPage.js` lines 107-125
**Scenario:** User spends 30+ minutes on intake form, session expires, refresh token also expired
**Impact:** Next API call fails, user loses unsaved work
**Current state:** Session warning only shows 30s before expiry
**Fix needed:** Auto-save more frequently, warn earlier (5 min before)

### 6. localStorage Cleared by Browser/User
**Location:** Multiple files
**Scenario:** User clears browser data, uses private mode, or browser auto-clears
**Impact:** 
- Loses `pb_client_record_id` (now mitigated by DB storage)
- Loses `access_token` - logged out without warning
- Loses `step2_instructions_seen` - minor annoyance

### 7. Mobile Safari Issues with localStorage
**Location:** All localStorage calls
**Scenario:** iOS Safari in private mode throws on localStorage access
**Impact:** Potential JavaScript errors breaking the app
**Fix needed:** Wrap localStorage in try-catch

### 8. Availability Cache Stale
**Location:** `booking.py` lines 134-190
**Scenario:** Background refresh task dies, cache becomes stale (>2 min old)
**Impact:** User selects time slot that's no longer available
**Current state:** 409 error handled gracefully, but UX is poor
**Fix needed:** Show "checking availability..." before confirming selection

### 9. Admin Resets User But PB Client ID Remains
**Location:** `server.py` lines 1605-1648
**Scenario:** Admin resets user progress, user books again
**Impact:** Old `pb_client_record_id` may conflict or cause confusion
**Fix needed:** Clear `pb_client_record_id` in reset function

### 10. Webhook Never Arrives (Practice Better)
**Location:** `server.py` webhook endpoint, `StepsPage.js` polling
**Scenario:** Practice Better webhook fails to fire or is delayed
**Impact:** User stuck on Step 1 even after booking
**Current state:** Polling helps, but relies on user staying on page
**Fix needed:** Add manual verification endpoint

---

## 🟢 LOW - Minor Issues

### 11. Video Fails to Load
**Location:** Bunny.net iframe embeds
**Scenario:** Bunny CDN is slow or blocked
**Impact:** User sees black box or loading spinner
**Fix needed:** Add fallback message "Video loading... If issues persist, you can skip"

### 12. Timezone Confusion in Booking
**Location:** `OnboardingBooking.jsx`, `useBooking.js`
**Scenario:** User's browser timezone differs from actual location
**Impact:** May book wrong time
**Current state:** Shows detected timezone
**Fix needed:** Add timezone selector for manual override

### 13. Form Validation Bypassed
**Location:** `IntakeForm.js`, form parts
**Scenario:** User manipulates DOM to bypass required fields
**Impact:** Incomplete intake form submitted
**Fix needed:** Server-side validation of required fields

### 14. Double-Click on "Activate Portal" Button
**Location:** `StepsPage.js` lines 1387-1430
**Scenario:** User double-clicks, triggers advance-step twice
**Impact:** Potential duplicate API calls
**Fix needed:** Add loading state / disable button after click

### 15. Back Button Behavior
**Location:** Browser navigation
**Scenario:** User presses back button on Step 2/3
**Impact:** May see previous step content briefly, then redirect
**Current state:** Works but can be jarring
**Fix needed:** Add history state management

---

## 🔧 Recommended Immediate Fixes

1. **Clear `pb_client_record_id` on admin reset** - Easy fix, prevents data inconsistency
2. **Add loading/disabled state to "Activate Portal" button** - Prevents double-clicks
3. **Wrap localStorage calls in try-catch** - Prevents Safari private mode crashes
4. **Show retry button on booking failure** - Better UX for 50+ users
5. **Validate required intake form fields server-side** - Data integrity

---

## Edge Cases for 50+ Non-Tech-Savvy Users

| Scenario | Risk | Current Handling |
|----------|------|------------------|
| Accidentally closes browser mid-booking | HIGH | Booking lost, must restart |
| Slow internet connection | MEDIUM | Loading states shown, but timeouts may confuse |
| Uses tablet in portrait mode | LOW | Responsive but cramped |
| Opens in multiple tabs | MEDIUM | May cause state conflicts |
| Forgets password next day | LOW | Password reset flow works |
| Clicks "Activate Portal" before PB processes client | MEDIUM | Link may not work yet |

---

*Analysis completed: January 2026*
