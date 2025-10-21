# GoHighLevel Webhook Setup Guide

Complete guide to integrate GoHighLevel (GHL) purchase completion with your Customer Portal.

## Overview

When a customer completes a purchase in GHL, a webhook will automatically create their account in the Customer Portal database, allowing them to set their password and access the wellness program.

---

## Step 1: Generate Webhook Secret

For security, generate a strong webhook secret key:

```bash
# Option 1: Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Option 2: Using OpenSSL
openssl rand -base64 32

# Option 3: Using /dev/urandom
head -c 32 /dev/urandom | base64
```

**Example output:** `xK7mP9vQ2nR8sL4wE6hT1yU0oI3bN5cM9dF8gH2jK7l`

**Save this key securely!** You'll need it for both your backend configuration and GHL webhook setup.

---

## Step 2: Configure Backend Environment

Add the webhook secret to your backend `.env` file:

```bash
# On your server
cd /home/appuser/app/backend
nano .env
```

Add this line:
```env
WEBHOOK_SECRET="xK7mP9vQ2nR8sL4wE6hT1yU0oI3bN5cM9dF8gH2jK7l"
```

Restart the backend:
```bash
sudo systemctl restart customer-portal-backend
```

---

## Step 3: Setup GHL Webhook

### A. Access GHL Settings

1. Log into your GoHighLevel account
2. Go to **Settings** → **Integrations** → **Webhooks**
3. Click **Add Webhook** or **Create New Webhook**

### B. Configure Webhook

**Webhook Name:** `Customer Portal - User Creation`

**Trigger Event:** Select one of:
- `Order Completed` (recommended)
- `Payment Received`
- `Invoice Paid`
- Or your specific trigger for successful purchase

**Webhook URL:**
```
https://portal.drjasonshumard.com/api/webhook/ghl?webhook_secret=xK7mP9vQ2nR8sL4wE6hT1yU0oI3bN5cM9dF8gH2jK7l
```

**⚠️ Important:** Replace:
- `portal.drjasonshumard.com` with your actual domain
- `xK7mP9vQ2nR8sL4wE6hT1yU0oI3bN5cM9dF8gH2jK7l` with your generated webhook secret

**Method:** `POST`

**Content Type:** `application/json`

**Request Body:**
```json
{
  "email": "{{contact.email}}",
  "name": "{{contact.name}}"
}
```

### C. Additional Optional Fields

If you want to capture more data, you can extend the webhook payload:

```json
{
  "email": "{{contact.email}}",
  "name": "{{contact.name}}",
  "phone": "{{contact.phone}}",
  "purchase_date": "{{order.created_at}}",
  "order_id": "{{order.id}}"
}
```

**Note:** You'll need to update the backend model to accept these additional fields.

---

## Step 4: Setup Redirect After Purchase

After successful payment, redirect customers to the signup page.

### In GHL Order Form / Payment Confirmation:

**Success Redirect URL:**
```
https://portal.drjasonshumard.com/signup?email={{contact.email}}
```

This will:
1. Redirect customer to signup page
2. Pre-fill their email address (grayed out)
3. Let them create their password
4. Grant immediate access to their wellness program

---

## Step 5: Test the Integration

### A. Test Webhook Directly

Use this curl command to test:

```bash
curl -X POST "https://portal.drjasonshumard.com/api/webhook/ghl?webhook_secret=YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User"
  }'
```

**Expected Response (Success):**
```json
{
  "message": "User created successfully",
  "user_id": "some-uuid-here"
}
```

**Expected Response (User Already Exists):**
```json
{
  "message": "User already exists",
  "user_id": "existing-uuid-here"
}
```

**Expected Response (Invalid Secret):**
```json
{
  "detail": "Invalid webhook secret"
}
```

### B. Test with Wrong Secret

```bash
curl -X POST "https://portal.drjasonshumard.com/api/webhook/ghl?webhook_secret=WRONG_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User"
  }'
```

Should return `401 Unauthorized` with message "Invalid webhook secret"

### C. Test GHL Webhook

In GHL:
1. Go to your webhook settings
2. Click **Test Webhook** or **Send Test**
3. Check the response status (should be 200 OK)
4. Verify user was created in your database

```bash
# Check if user was created
mongosh
> use customer_portal_db
> db.users.find({email: "test@example.com"})
```

---

## Step 6: Verify Complete Flow

### End-to-End Test:

1. **Make Test Purchase** in GHL
2. **Webhook Fires** → User created in database
3. **Customer Redirected** to signup page with email pre-filled
4. **Customer Sets Password** and completes signup
5. **Customer Logs In** and accesses Step 1
6. **Verify in Admin Panel** that user appears

---

## Troubleshooting

### Webhook Returns 401 Unauthorized

**Problem:** Invalid or missing webhook secret

**Solutions:**
- Verify webhook secret matches in both `.env` and GHL URL
- Check for extra spaces or special characters
- Ensure backend service restarted after adding secret
- Test with curl command above

```bash
# Verify secret in backend
grep WEBHOOK_SECRET /home/appuser/app/backend/.env

# Restart backend
sudo systemctl restart customer-portal-backend

# Check logs
sudo journalctl -u customer-portal-backend -n 50
```

### Webhook Returns 422 Unprocessable Entity

**Problem:** Missing or invalid email/name fields

**Solutions:**
- Verify GHL is sending both `email` and `name` fields
- Check JSON format is correct
- Ensure content type is `application/json`
- Review GHL webhook logs for payload sent

### User Not Created

**Problem:** Webhook succeeds but user not in database

**Solutions:**
```bash
# Check MongoDB is running
sudo systemctl status mongod

# Check backend logs for errors
sudo journalctl -u customer-portal-backend -f

# Verify database connection
mongosh
> use customer_portal_db
> db.users.find()
```

### Webhook Times Out

**Problem:** GHL shows timeout error

**Solutions:**
- Verify your domain is accessible externally
- Check firewall allows incoming connections on port 443
- Ensure SSL certificate is valid
- Test backend API directly:

```bash
curl https://portal.drjasonshumard.com/api/
```

### User Exists Error

**Problem:** Webhook returns "User already exists"

**This is normal behavior!** The webhook is idempotent - if a user with that email already exists, it won't create a duplicate. The customer can still proceed to signup/login.

---

## Security Best Practices

### ✅ DO:
- Use a strong, randomly generated webhook secret (32+ characters)
- Keep webhook secret confidential (don't commit to git)
- Use HTTPS for webhook endpoint
- Monitor webhook logs for suspicious activity
- Rotate webhook secret periodically (every 6-12 months)

### ❌ DON'T:
- Use simple or predictable webhook secrets
- Share webhook secret in unsecured channels
- Allow webhook endpoint without authentication
- Ignore failed webhook attempts
- Hard-code webhook secret in application code

---

## Monitoring & Maintenance

### View Webhook Activity

```bash
# Backend logs (shows all webhook attempts)
sudo journalctl -u customer-portal-backend | grep webhook

# Recent webhook attempts (last 50)
sudo journalctl -u customer-portal-backend -n 50 | grep ghl_webhook

# Real-time monitoring
sudo journalctl -u customer-portal-backend -f | grep webhook
```

### Count Users Created Today

```bash
mongosh
> use customer_portal_db
> db.users.countDocuments({
    created_at: {
      $gte: new Date(new Date().setHours(0,0,0,0)).toISOString()
    }
  })
```

### View Recent Users

```bash
mongosh
> use customer_portal_db
> db.users.find({}, {name: 1, email: 1, created_at: 1}).sort({created_at: -1}).limit(10)
```

---

## Webhook Payload Reference

### Required Fields (Current Implementation)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Customer email address (unique identifier) |
| `name` | string | Yes | Customer full name |

### GHL Custom Variables Available

You can use any of these in your webhook body:

**Contact Variables:**
- `{{contact.id}}` - Contact ID
- `{{contact.email}}` - Email address
- `{{contact.name}}` - Full name
- `{{contact.first_name}}` - First name
- `{{contact.last_name}}` - Last name
- `{{contact.phone}}` - Phone number
- `{{contact.company}}` - Company name

**Order Variables:**
- `{{order.id}}` - Order ID
- `{{order.amount}}` - Order amount
- `{{order.created_at}}` - Order date/time
- `{{order.status}}` - Order status

**Payment Variables:**
- `{{payment.amount}}` - Payment amount
- `{{payment.method}}` - Payment method
- `{{payment.transaction_id}}` - Transaction ID

---

## Advanced Configuration

### Extending the Webhook

If you want to capture additional data (phone, order ID, etc.), update the backend model:

**1. Update the Pydantic model:**

```python
# In server.py
class GHLWebhookData(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    order_id: Optional[str] = None
    purchase_amount: Optional[float] = None
```

**2. Update User model to store extra data:**

```python
class User(BaseModel):
    # ... existing fields ...
    phone: Optional[str] = None
    order_id: Optional[str] = None
    purchase_amount: Optional[float] = None
```

**3. Update webhook handler:**

```python
user = User(
    email=data.email,
    name=data.name,
    phone=data.phone,
    order_id=data.order_id,
    purchase_amount=data.purchase_amount,
    password_hash=""
)
```

**4. Update GHL webhook body:**

```json
{
  "email": "{{contact.email}}",
  "name": "{{contact.name}}",
  "phone": "{{contact.phone}}",
  "order_id": "{{order.id}}",
  "purchase_amount": {{order.amount}}
}
```

---

## Quick Reference Card

**Webhook Endpoint:**
```
POST https://YOUR_DOMAIN.com/api/webhook/ghl?webhook_secret=YOUR_SECRET
```

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "{{contact.email}}",
  "name": "{{contact.name}}"
}
```

**Redirect URL:**
```
https://YOUR_DOMAIN.com/signup?email={{contact.email}}
```

**Test Command:**
```bash
curl -X POST "https://YOUR_DOMAIN.com/api/webhook/ghl?webhook_secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "name": "Test User"}'
```

---

## Support

If you encounter issues:

1. Check backend logs: `sudo journalctl -u customer-portal-backend -f`
2. Verify webhook secret matches
3. Test webhook with curl command
4. Check GHL webhook logs for errors
5. Verify user was created in database

---

**GHL Integration Complete! 🎉**

Your customers will now automatically get portal access after purchase.
