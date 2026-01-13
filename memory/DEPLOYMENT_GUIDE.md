# Deployment Guide - January 2026 Release

## Overview
This release includes critical bug fixes, UX improvements for 50+ users, and backend reliability enhancements.

**⚠️ IMPORTANT:** This release replaces the Practice Better iframe widget with a custom booking calendar. New frontend dependency required.

---

## 📦 New Dependencies

### Frontend (Required for Custom Booking)
```bash
# @tanstack/react-query - Used for booking data fetching, caching, and state management
yarn add @tanstack/react-query@^5.90.16
```

The custom booking system requires:
- `@tanstack/react-query` - Already added to package.json
- `QueryClientProvider` wrapper in App.js - Already configured

**Note:** If deploying to a fresh environment, run `yarn install` to install all dependencies including this one.

---

## 📋 Summary of Changes

### Bug Fixes
| Change | Files Modified |
|--------|----------------|
| Removed duplicate modal after booking | `StepsPage.js` |
| Fixed Step 3 showing outcome page | `Dashboard.js`, `OutcomePage.js` |
| Fixed Practice Better activation URL formula | `StepsPage.js` |
| Admin reset now clears PB client ID | `server.py` |

### New Features
| Feature | Files Modified |
|---------|----------------|
| Logout confirmation dialog | `StepsPage.js` |
| Session expiration warning (30s before) | `StepsPage.js` |
| Phone auto-population in booking | `StepsPage.js`, `server.py` |
| Refunded count in admin dashboard | `server.py`, `AdminDashboard.js` |
| Intake form status tracking | `server.py` |

### Reliability Improvements
| Improvement | Files Modified |
|-------------|----------------|
| Backend auto-advance on booking success | `booking.py` |
| PB client ID saved atomically in backend | `booking.py` |
| Safe localStorage wrapper (Safari fix) | `safeStorage.js`, `Login.js` |

---

## 📁 Files Changed

### Backend (`/app/backend/`)
```
server.py          - User model, intake form tracking, admin reset, refunded count
booking.py         - Auto-advance, atomic client ID save
```

### Frontend (`/app/frontend/src/`)
```
pages/StepsPage.js       - Logout dialog, session warning, booking callbacks
pages/Dashboard.js       - Fixed completion logic
pages/OutcomePage.js     - Added step check redirect
pages/AdminDashboard.js  - Added refunded to step distribution
pages/Login.js           - Safe localStorage usage
utils/safeStorage.js     - NEW FILE - Safari private mode fix
```

---

## 🗄️ Database Changes

### New Fields Added to `users` Collection
```javascript
{
  pb_client_record_id: String,  // Practice Better client ID (now persisted)
  phone: String                 // User phone number (already existed, now returned in API)
}
```

### New Fields Added to `intake_forms` Collection
```javascript
{
  submission_id: String,        // Unique submission ID for tracking
  status: String,               // "processing" | "completed" | "completed_with_errors" | "completed_pdf_failed"
  pdf_status: String,           // "pending" | "generated" | "uploaded_both" | "uploaded_dropbox_only" | "uploaded_drive_only" | "upload_failed"
  pdf_error: String,            // Error message if PDF failed
  pdf_errors: [String],         // Array of upload errors
  webhook_status: String,       // "sent" | "failed" | "error"
  completed_at: String          // ISO timestamp when processing completed
}
```

### No Migration Required
- New fields are added dynamically
- Existing documents work without changes

---

## 🚀 Deployment Steps

### 1. Pre-Deployment Checklist
```bash
# Verify all tests pass
cd /app
python -m pytest backend/tests/ -v

# Check for lint errors
cd /app/frontend && yarn lint
cd /app/backend && ruff check .
```

### 2. Backend Deployment
```bash
# Install any new dependencies (none in this release)
cd /app/backend
pip install -r requirements.txt

# Restart backend service
sudo supervisorctl restart backend

# Verify backend is running
sudo supervisorctl status backend
curl -s https://YOUR_DOMAIN/api/health | jq
```

### 3. Frontend Deployment
```bash
# Install dependencies (IMPORTANT: includes @tanstack/react-query for custom booking)
cd /app/frontend
yarn install

# Verify @tanstack/react-query is installed
yarn list @tanstack/react-query

# Build for production
yarn build

# Restart frontend service
sudo supervisorctl restart frontend
```

**Note on Custom Booking Migration:**
- Old: Practice Better iframe widget (`PracticeBetterEmbed.js`)
- New: Custom booking calendar (`OnboardingBooking.jsx` + `useBooking.js`)
- The old widget code is preserved in comments for rollback if needed

### 4. Post-Deployment Verification
```bash
# Test API endpoints
API_URL="https://YOUR_DOMAIN/api"

# 1. Test analytics includes refunded
curl -s "$API_URL/admin/analytics" -H "Authorization: Bearer $TOKEN" | jq '.step_distribution.refunded'

# 2. Test user progress includes pb_client_record_id
curl -s "$API_URL/user/progress" -H "Authorization: Bearer $TOKEN" | jq '.pb_client_record_id'

# 3. Test booking endpoint (don't actually book)
curl -s "$API_URL/booking/health" | jq
```

---

## 🔄 Rollback Procedure

### If Issues Occur

#### Backend Rollback
```bash
# Revert to previous commit
cd /app/backend
git checkout HEAD~1 -- server.py booking.py

# Restart
sudo supervisorctl restart backend
```

#### Frontend Rollback
```bash
# Revert to previous commit
cd /app/frontend
git checkout HEAD~1 -- src/pages/StepsPage.js src/pages/Dashboard.js src/pages/OutcomePage.js src/pages/AdminDashboard.js src/pages/Login.js

# Remove new file
rm src/utils/safeStorage.js

# Rebuild and restart
yarn build
sudo supervisorctl restart frontend
```

---

## 🧪 Testing Checklist

### Critical Path Testing
- [ ] **Login Flow**: User can log in (test Safari private mode)
- [ ] **Step 1 Booking**: Book a call, verify auto-advance to Step 2
- [ ] **Step 2 Form**: Submit intake form, verify status tracking
- [ ] **Step 3 Activation**: Click activate button, verify correct URL opens
- [ ] **Admin Dashboard**: Verify refunded count shows
- [ ] **Admin Reset**: Reset user, verify they return to Step 1 with cleared PB ID

### Edge Case Testing
- [ ] Session expiration warning appears 30s before expiry
- [ ] Logout confirmation dialog appears on logout click
- [ ] User on Step 3 cannot access /outcome directly
- [ ] Phone number pre-populates in booking form

### Mobile Testing
- [ ] Test on iOS Safari (private mode)
- [ ] Test on Android Chrome
- [ ] Verify touch targets are adequate for 50+ users

---

## 📊 Monitoring

### Key Metrics to Watch Post-Deploy
1. **Error rates** in Practice Better booking
2. **Intake form submission success rate** (check `pdf_status` field)
3. **Session renewal success rate**
4. **Step advancement success rate**

### Log Locations
```bash
# Backend logs
tail -f /var/log/supervisor/backend.err.log

# Frontend logs (browser console)
# Check for localStorage errors on Safari
```

---

## 🔧 Configuration

### Environment Variables (No Changes)
All existing environment variables remain the same:
- `MONGO_URL` - MongoDB connection string
- `REACT_APP_BACKEND_URL` - Frontend API URL
- Practice Better API credentials (unchanged)

### App.js QueryClient Configuration
The custom booking requires QueryClientProvider in App.js. This is already configured:

```javascript
// App.js - Already configured
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 2,
    },
  },
});

// Wrap app with QueryClientProvider
<QueryClientProvider client={queryClient}>
  {/* ... app content ... */}
</QueryClientProvider>
```

If deploying to a new environment, ensure App.js includes this configuration.

---

## 📝 Notes for Support Team

### New Admin Features
- **Refunded Count**: Now visible in Step Distribution chart (red bar at top)
- **Reset Function**: Now also clears Practice Better client ID

### New User-Facing Features
- **Logout Confirmation**: Users must confirm before logging out
- **Session Warning**: 30-second countdown before auto-logout with option to renew

### Troubleshooting
| Issue | Solution |
|-------|----------|
| User stuck on Step 1 after booking | Check backend logs for auto-advance errors. User can refresh - backend should have advanced them |
| Intake form shows "processing" | Check `pdf_status` field in database. May need manual PDF regeneration |
| Safari users can't log in | Verify `safeStorage.js` is properly imported in `Login.js` |

---

## 📅 Release Information

- **Release Date**: January 13, 2026
- **Version**: 2.1.0
- **Prepared By**: E1 Agent
- **Reviewed By**: [Pending]

---

## Appendix: File Diff Summary

### New Files
```
/app/frontend/src/utils/safeStorage.js
/app/memory/CODEBASE_REVIEW.md
/app/memory/FAILURE_POINTS_ANALYSIS.md
/app/reset_user_step.py
```

### Modified Files (Line Count Changes)
```
StepsPage.js        +200 lines (dialogs, session handling)
Dashboard.js        ~20 lines (completion logic fix)
OutcomePage.js      +10 lines (redirect protection)
AdminDashboard.js   +2 lines (refunded count)
Login.js            +3 lines (safe storage import)
server.py           +80 lines (status tracking, phone field)
booking.py          +50 lines (auto-advance, atomic save)
```
