# Password Reset Guide

Complete documentation for the password reset functionality in the Customer Portal.

## Overview

The password reset system allows users to securely reset their passwords via email. It uses:
- **Email Service:** Resend API
- **Token Generation:** Cryptographically secure random tokens
- **Token Expiration:** 1 hour for security
- **Email Templates:** Professional HTML emails with reset links

---

## How Password Reset Works

### User Flow:

1. **User Forgets Password**
   - User goes to login page: `https://portal.drjasonshumard.com/login`
   - Clicks "Forgot password?" link
   - Modal opens asking for email

2. **Request Reset**
   - User enters their email address
   - Clicks "Send Reset Link"
   - System validates email exists in database

3. **Email Sent**
   - Secure reset token generated (32 bytes)
   - Token stored in database with 1-hour expiration
   - Email sent to user with reset link
   - User sees: "If the email exists, a reset link has been sent"

4. **User Receives Email**
   - Email from: "DrJason Portal <noreply@drjasonshumard.com>"
   - Subject: "Password Reset Request"
   - Contains blue "Reset Password" button
   - Link format: `https://portal.drjasonshumard.com/reset-password?token=SECURE_TOKEN`

5. **Reset Password**
   - User clicks link in email
   - Redirected to password reset page
   - Token validated (must not be expired)
   - User enters new password (minimum 8 characters)
   - User confirms new password

6. **Password Updated**
   - New password hashed with bcrypt
   - Reset token cleared from database
   - User sees success message
   - User redirected to login page

7. **Login with New Password**
   - User logs in with new password
   - Access granted to their account

---

## Technical Implementation

### Backend Endpoints

#### 1. Request Password Reset
```
POST /api/auth/request-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (Always 200):**
```json
{
  "message": "If the email exists, a reset link has been sent"
}
```

**Note:** Always returns success to prevent email enumeration attacks.

#### 2. Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "secure_reset_token_here",
  "new_password": "NewPassword123"
}
```

**Success Response (200):**
```json
{
  "message": "Password reset successful"
}
```

**Error Response (400):**
```json
{
  "detail": "Invalid or expired reset token"
}
```

### Database Schema

**Users Collection - Reset Fields:**
```javascript
{
  // ... other user fields ...
  reset_token: String,        // Secure random token
  reset_token_expires: DateTime,  // Expiration timestamp (1 hour)
}
```

### Email Template

The reset email includes:
- Professional HTML layout
- Clear call-to-action button
- Expiration warning (1 hour)
- Security note about ignoring if not requested
- Sender: "DrJason Portal <noreply@drjasonshumard.com>"

---

## Configuration

### Resend Setup

**Current Configuration:**
- **API Key:** `re_V2xa5xTh_GeWfiWrEeMeMMry1FKhr8yVa`
- **From Address:** `DrJason Portal <noreply@drjasonshumard.com>`
- **Status:** ✅ Active

### Environment Variables

```env
# In /app/backend/.env
RESEND_API_KEY="re_V2xa5xTh_GeWfiWrEeMeMMry1FKhr8yVa"
FRONTEND_URL="https://patientportal-33.preview.emergentagent.com"
```

**Important:** 
- `RESEND_API_KEY` - Your Resend API key for sending emails
- `FRONTEND_URL` - Used to construct the reset link in emails

### Verify Configuration

```bash
# Check environment variables
grep RESEND_API_KEY /app/backend/.env
grep FRONTEND_URL /app/backend/.env

# Restart backend after changes
sudo supervisorctl restart backend
```

---

## Resend Domain Configuration

### Current Status

Your Resend API key is configured, but you may need to verify your sending domain for better email deliverability.

### Option 1: Use Resend's Shared Domain (Current)

**From Address:** `noreply@drjasonshumard.com` (if domain not verified, it will use Resend's domain)

**Pros:**
- Works immediately
- No DNS configuration needed
- Good for testing

**Cons:**
- Lower deliverability
- Generic sender domain
- May end up in spam

### Option 2: Verify Your Domain (Recommended for Production)

To send from your actual domain (`@drjasonshumard.com`):

1. **Add Domain in Resend Dashboard:**
   - Go to https://resend.com/domains
   - Click "Add Domain"
   - Enter: `drjasonshumard.com`

2. **Add DNS Records:**
   Resend will provide DNS records like:
   ```
   Type: TXT
   Name: _resend
   Value: [provided by Resend]
   
   Type: CNAME
   Name: resend._domainkey
   Value: [provided by Resend]
   
   Type: TXT
   Name: @ or blank
   Value: v=spf1 include:resend.com ~all
   ```

3. **Add to Your DNS Provider:**
   - Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
   - Add the DNS records provided by Resend
   - Wait for DNS propagation (can take up to 48 hours, usually 1-2 hours)

4. **Verify in Resend:**
   - Return to Resend dashboard
   - Click "Verify Domain"
   - Once verified, you can send from `@drjasonshumard.com`

5. **Update Backend Code (if needed):**
   ```python
   # In server.py, update the from address
   resend.Emails.send({
       "from": "Dr. Jason Shumard Portal <portal@drjasonshumard.com>",
       # ... rest of email config
   })
   ```

---

## Testing Password Reset

### Test 1: Request Reset for Existing User

```bash
# Create a test user first (if not exists)
curl -X POST "https://patientportal-33.preview.emergentagent.com/api/webhook/ghl?webhook_secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User"}'

# Request password reset
curl -X POST "https://patientportal-33.preview.emergentagent.com/api/auth/request-reset" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

**Expected Response:**
```json
{
  "message": "If the email exists, a reset link has been sent"
}
```

**Check Database:**
```bash
mongosh
> use customer_portal_db
> db.users.findOne({email: "test@example.com"}, {reset_token: 1, reset_token_expires: 1})
```

Should show reset token and expiration timestamp.

### Test 2: Check Email Sent

**Monitor backend logs:**
```bash
sudo journalctl -u customer-portal-backend -f | grep reset
```

**Successful send:**
```
INFO: Reset email sent to test@example.com
```

**Failed send:**
```
ERROR: Failed to send reset email: [error message]
```

### Test 3: Complete Password Reset

1. **Get reset token from database:**
```bash
mongosh
> use customer_portal_db
> db.users.findOne({email: "test@example.com"}, {reset_token: 1})
```

2. **Visit reset URL:**
```
https://patientportal-33.preview.emergentagent.com/reset-password?token=TOKEN_FROM_DB
```

3. **Enter new password and submit**

4. **Test login with new password**

### Test 4: Test Token Expiration

Tokens expire after 1 hour. To test:

1. Request password reset
2. Wait 1 hour (or manually update expiration in DB to past time)
3. Try to use the token
4. Should see: "Reset token has expired"

---

## Troubleshooting

### Email Not Sending

**Check 1: Verify API Key**
```bash
# Check if API key is set
grep RESEND_API_KEY /app/backend/.env

# Should return: RESEND_API_KEY="re_V2xa5xTh_GeWfiWrEeMeMMry1FKhr8yVa"
```

**Check 2: Backend Logs**
```bash
sudo journalctl -u customer-portal-backend -f | grep -i "reset\|email\|resend"
```

Common errors:
- `API key is invalid` - API key not set or incorrect
- `Domain not verified` - Need to verify sending domain
- `Rate limit exceeded` - Too many requests (Resend free tier: 100 emails/day)

**Check 3: Resend Dashboard**
- Go to https://resend.com/emails
- Check if emails appear in your sent logs
- Check for any errors or bounces

**Check 4: Test Resend API Directly**
```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_V2xa5xTh_GeWfiWrEeMeMMry1FKhr8yVa' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "test@resend.dev",
    "to": "your-email@example.com",
    "subject": "Test Email",
    "html": "<p>This is a test</p>"
  }'
```

### Email Goes to Spam

**Solutions:**
1. Verify your domain in Resend (see above)
2. Add SPF record to DNS
3. Add DKIM record to DNS
4. Use a professional from address
5. Avoid spam trigger words in subject/body

### Token Invalid or Expired

**Check token in database:**
```bash
mongosh
> use customer_portal_db
> db.users.findOne({email: "user@example.com"}, {reset_token: 1, reset_token_expires: 1})
```

**Manually clear expired tokens:**
```bash
mongosh
> use customer_portal_db
> db.users.updateMany(
    {reset_token_expires: {$lt: new Date()}},
    {$set: {reset_token: null, reset_token_expires: null}}
  )
```

### User Not Found

If user enters an email that doesn't exist:
- System still returns success message (security feature)
- No email is sent
- No error shown to user (prevents email enumeration)

**Verify user exists:**
```bash
mongosh
> use customer_portal_db
> db.users.findOne({email: "user@example.com"})
```

### Password Not Updating

**Check logs:**
```bash
sudo journalctl -u customer-portal-backend -n 50 | grep reset
```

**Verify token matches:**
```bash
# Get token from URL
# Compare with database
mongosh
> use customer_portal_db
> db.users.findOne({reset_token: "token_from_url"})
```

**Test password hashing:**
```bash
python3 << EOF
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed = pwd_context.hash("TestPassword123")
print(f"Hash: {hashed}")
print(f"Verify: {pwd_context.verify('TestPassword123', hashed)}")
EOF
```

---

## Security Features

### ✅ Implemented Security Measures:

1. **Secure Token Generation**
   - Uses Python's `secrets` module (cryptographically secure)
   - 32-byte random tokens
   - URL-safe encoding

2. **Token Expiration**
   - Tokens expire after 1 hour
   - Expired tokens automatically rejected

3. **Email Enumeration Prevention**
   - Always returns success message
   - Doesn't reveal if email exists or not

4. **Password Hashing**
   - Bcrypt with automatic salt generation
   - Industry-standard password storage

5. **One-Time Use Tokens**
   - Token cleared from database after successful reset
   - Cannot be reused

6. **Rate Limiting Ready**
   - Backend supports rate limiting middleware
   - Can be added to prevent abuse

### 🔐 Additional Security Recommendations:

1. **Add Rate Limiting:**
```python
# Limit password reset requests per IP
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@app.post("/api/auth/request-reset")
@limiter.limit("3/hour")  # 3 requests per hour per IP
async def request_password_reset(...):
    ...
```

2. **Log Reset Attempts:**
```python
# Add logging for security monitoring
logging.info(f"Password reset requested for: {request.email}")
```

3. **Email Notifications:**
```python
# Send email even if user doesn't exist (to notify actual owner)
# "Someone requested a password reset for this email..."
```

---

## Resend API Limits

### Free Tier (Current):
- **100 emails/day**
- **1 domain**
- **100 emails/month** to unverified emails

### If You Need More:
- Upgrade to paid plan at https://resend.com/pricing
- $20/month for 50,000 emails/month
- Unlimited verified domains

### Monitor Usage:
- Check dashboard: https://resend.com/overview
- View daily/monthly usage
- Set up usage alerts

---

## Monitoring & Maintenance

### View Password Reset Activity

```bash
# All password reset requests
sudo journalctl -u customer-portal-backend | grep "reset requested"

# Recent resets (last 50)
sudo journalctl -u customer-portal-backend -n 50 | grep reset

# Real-time monitoring
sudo journalctl -u customer-portal-backend -f | grep reset
```

### Count Reset Requests Today

```bash
mongosh
> use customer_portal_db
> db.users.countDocuments({
    reset_token: {$ne: null},
    reset_token_expires: {$gte: new Date()}
  })
```

### Cleanup Expired Tokens (Optional Cron Job)

```bash
# Create cleanup script
cat > /usr/local/bin/cleanup-reset-tokens.sh << 'EOF'
#!/bin/bash
mongosh --quiet --eval "
  db = db.getSiblingDB('customer_portal_db');
  result = db.users.updateMany(
    {reset_token_expires: {\$lt: new Date()}},
    {\$set: {reset_token: null, reset_token_expires: null}}
  );
  print('Cleaned up ' + result.modifiedCount + ' expired tokens');
"
EOF

sudo chmod +x /usr/local/bin/cleanup-reset-tokens.sh

# Run daily at 3 AM
sudo crontab -e
# Add: 0 3 * * * /usr/local/bin/cleanup-reset-tokens.sh
```

---

## Email Customization

### Update Email Template

Edit the HTML email template in `server.py`:

```python
resend.Emails.send({
    "from": "DrJason Portal <noreply@drjasonshumard.com>",
    "to": request.email,
    "subject": "Password Reset Request",
    "html": f"""
    <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password. Click the button below to reset it:</p>
            <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
        </body>
    </html>
    """
})
```

### Customize Sender Name

```python
"from": "Dr. Jason Shumard <portal@drjasonshumard.com>"
```

---

## Quick Reference

**Request Reset:**
```bash
POST /api/auth/request-reset
Body: {"email": "user@example.com"}
```

**Reset Password:**
```bash
POST /api/auth/reset-password
Body: {"token": "...", "new_password": "..."}
```

**Check Logs:**
```bash
sudo journalctl -u customer-portal-backend -f | grep reset
```

**View Resend Dashboard:**
https://resend.com/emails

**Test Email:**
https://resend.com/emails/send-test-email

---

## Support

If password reset isn't working:

1. ✅ Check Resend API key is set in `.env`
2. ✅ Restart backend: `sudo systemctl restart customer-portal-backend`
3. ✅ Check backend logs for errors
4. ✅ Verify user exists in database
5. ✅ Check Resend dashboard for sent emails
6. ✅ Consider verifying your domain for better deliverability

---

**Password Reset System Ready! 🔐**

Users can now securely reset their passwords via email.
