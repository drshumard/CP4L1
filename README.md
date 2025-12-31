# Customer Portal - Dr. Jason Shumard Diabetes Wellness Program

A comprehensive customer portal for managing a 7-step diabetes wellness program with step-by-step progression, custom intake forms, PDF generation, and admin management capabilities.

## 🌟 Features

### User Features
- **Secure Authentication**: JWT-based authentication with refresh tokens
- **Auto-Login Links**: Magic links from GHL for seamless user access
- **Post-Purchase Signup**: Users created via GHL webhook, then complete signup with password
- **7-Step Wellness Journey**: Progressive unlocking system with task completion tracking
- **Interactive Step 1**: Video player + embedded booking calendar for one-on-one consultation
- **Custom Intake Forms (Step 2)**: 3-part intake form replacing Practice Better
  - Part 1: Diabetes Profile (personal info, medical history, health goals)
  - Part 2: HIPAA Consent (full legal text with signature)
  - Part 3: Telehealth Consent (full legal text with signature)
- **Auto-Save**: Form progress saved automatically as you type
- **Validation Modal**: Lists all missing required fields with "Fix" buttons
- **PDF Generation**: Professional PDF generated on form submission
- **Dropbox Integration**: PDFs automatically uploaded to specified Dropbox folder
- **Zapier Webhook**: Form submissions trigger Zapier workflows
- **Step 3 Email Activation**: Instructions to activate Practice Better account
- **Progress Tracking**: Visual step indicators showing completed, current, and locked steps
- **Dashboard**: Overview of current progress with "onboarding complete" state
- **Outcome Page**: Celebratory completion page with animations and achievements
- **Password Reset**: Email-based password reset via Resend integration
- **Bot Protection**: Cloudflare Turnstile integration

### Admin Features
- **User Management**: View all users with search, filter, and pagination
- **User Actions Modal**: View details, reset password, reset progress, set step, delete user
- **Progress Reset**: Clears user progress AND intake form data (preserves auto-fill info)
- **Analytics Dashboard**: Total users, completion rates, step distribution charts
- **Activity Logs**: Track user actions, admin changes, and system events
- **Role-Based Access**: Admin-only routes protected by role verification

### Design
- **Supabase-Inspired UI**: Off-white background (#F4F3F2) with subtle grid pattern
- **Modern Card Design**: Clean shadows with teal accent lines
- **Glass Morphism**: Subtle glass effects on cards and modals
- **Smooth Animations**: Framer Motion for entrance animations and micro-interactions
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Teal & White Branding**: Professional healthcare-appropriate color scheme

## 🏗️ Architecture

### Tech Stack

**Frontend**
- React 18
- React Router for navigation
- Tailwind CSS + Shadcn UI components
- Framer Motion for animations
- React Player for video content
- React Signature Canvas for e-signatures
- React DatePicker for date inputs
- Axios for API calls
- Sonner for toast notifications

**Backend**
- FastAPI (Python)
- MongoDB with Motor (async driver)
- JWT authentication with python-jose
- Bcrypt for password hashing
- ReportLab for PDF generation
- Dropbox API for file uploads
- Resend for email notifications
- HTTPX for webhook calls

**Infrastructure**
- Nginx (reverse proxy & static file serving)
- Systemd (process management)
- Let's Encrypt (SSL certificates)
- AWS Lightsail (recommended hosting)

### Project Structure

```
/app
├── backend/
│   ├── server.py              # Main FastAPI application
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Environment variables
│   ├── service_account.json   # (Legacy - Google credentials, can be removed)
│   └── services/
│       ├── dropbox_service.py # Dropbox upload service
│       ├── google_drive.py    # (Legacy - Google Drive, replaced by Dropbox)
│       └── pdf_generator.py   # PDF generation with ReportLab
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Signup.js
│   │   │   ├── Login.js
│   │   │   ├── AutoLogin.js       # Magic link handler
│   │   │   ├── Dashboard.js
│   │   │   ├── StepsPage.js       # Steps 1, 2, 3 layouts
│   │   │   ├── AdminDashboard.js
│   │   │   ├── OutcomePage.js
│   │   │   └── ResetPassword.js
│   │   ├── components/
│   │   │   ├── IntakeForm.js      # Main form state manager
│   │   │   ├── intake-form/       # Refactored form parts
│   │   │   │   ├── Part1_DiabetesProfile.js
│   │   │   │   ├── Part2_HIPAAConsent.js
│   │   │   │   ├── Part3_TelehealthConsent.js
│   │   │   │   ├── ValidationModal.js
│   │   │   │   └── index.js
│   │   │   └── ui/               # Shadcn UI components
│   │   ├── App.js
│   │   └── index.css            # Global styles (Supabase-inspired)
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env
├── DEPLOYMENT.md
├── DEPLOYMENT_CHECKLIST.md
└── README.md
```

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB 7.0+
- Yarn

### 1. Clone Repository

```bash
git clone YOUR_REPO_URL
cd app
```

### 2. Setup Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="customer_portal_db"
JWT_SECRET_KEY="dev-secret-key-change-in-production"
CORS_ORIGINS="http://localhost:3000"
RESEND_API_KEY=""
FRONTEND_URL="http://localhost:3000"
WEBHOOK_SECRET="dev-webhook-secret"
TURNSTILE_SECRET_KEY=""
GOOGLE_DRIVE_FOLDER_ID=""
GOOGLE_DRIVE_IMPERSONATE_USER=""
EOF

# Start backend
uvicorn server:app --reload --port 8001
```

### 3. Setup Frontend

```bash
cd frontend
yarn install

# Create .env file
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env

# Start frontend
yarn start
```

### 4. Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8001/api

## 📋 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/ghl` | Create user from GHL purchase webhook |
| POST | `/api/auth/signup` | Complete signup with password |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/auto-login` | Magic link login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/request-reset` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |

### User
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/me` | Get current user info (includes first_name, last_name) |
| GET | `/api/user/progress` | Get user progress data |
| POST | `/api/user/complete-task` | Mark task as complete |
| POST | `/api/user/advance-step` | Advance to next step |

### Intake Forms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/intake-form` | Get saved intake form data |
| POST | `/api/user/intake-form/save` | Auto-save form progress |
| POST | `/api/user/intake-form/submit` | Submit form, generate PDF, upload to Drive |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | Get all users (paginated, searchable) |
| GET | `/api/admin/analytics` | Get analytics data |
| GET | `/api/admin/activity-logs` | Get activity logs |
| POST | `/api/admin/user/:id/reset` | Reset user progress AND intake form |
| POST | `/api/admin/user/:id/set-step` | Set user to specific step |
| POST | `/api/admin/user/:id/send-reset-email` | Send password reset email |
| DELETE | `/api/admin/user/:id` | Delete user |

## 🔐 Environment Variables

### Backend (.env)

```env
# Database
MONGO_URL="mongodb://localhost:27017"
DB_NAME="customer_portal_db"

# Security
JWT_SECRET_KEY="your-secure-secret-key"
WEBHOOK_SECRET="your-webhook-secret"
CORS_ORIGINS="https://yourdomain.com"

# Email (Resend)
RESEND_API_KEY="re_xxxx"
FRONTEND_URL="https://yourdomain.com"

# Bot Protection (Cloudflare Turnstile)
TURNSTILE_SECRET_KEY="0x4AAA..."

# Dropbox Integration (for PDF uploads)
DROPBOX_ACCESS_TOKEN="your-dropbox-access-token"
DROPBOX_UPLOAD_FOLDER="/Patient Intake Forms"
```

### Frontend (.env)

```env
REACT_APP_BACKEND_URL="https://api.yourdomain.com"
```

## 📁 Dropbox Setup

The application uses Dropbox to upload intake form PDFs to a specified folder.

### 1. Create a Dropbox App

1. Go to [Dropbox Developer Console](https://www.dropbox.com/developers/apps)
2. Click "Create app"
3. Choose "Scoped access" 
4. Choose "Full Dropbox" access
5. Name your app (e.g., "Patient Intake Forms")
6. Click "Create app"

### 2. Configure Permissions

In your app settings, go to the "Permissions" tab and enable:
- `files.metadata.read` - View file/folder metadata
- `files.content.write` - Upload files
- `files.content.read` - Download files (optional)
- `sharing.write` - Create shared links

Click "Submit" to save permissions.

### 3. Generate Access Token

In the "Settings" tab:
1. Scroll to "OAuth 2" section
2. Under "Generated access token", click "Generate"
3. Copy the token - this is your `DROPBOX_ACCESS_TOKEN`

**Note**: This token expires. For production, implement OAuth 2.0 with refresh tokens.

### 4. Create Target Folder

1. Log into Dropbox
2. Create a folder for intake forms (e.g., "Patient Intake Forms")
3. The folder path (e.g., `/Patient Intake Forms`) goes in `DROPBOX_UPLOAD_FOLDER`

### Environment Variables

```env
DROPBOX_ACCESS_TOKEN=sl.xxxxxxxxxxxxx...
DROPBOX_UPLOAD_FOLDER=/Patient Intake Forms
```

## 📊 Database Schema

### Users Collection
```javascript
{
  id: String,                    // UUID
  email: String,                 // Unique
  name: String,                  // Display name
  first_name: String,            // From GHL webhook
  last_name: String,             // From GHL webhook
  password_hash: String,
  current_step: Number,          // 1-7
  role: String,                  // "user" or "admin"
  reset_token: String,
  reset_token_expires: DateTime,
  created_at: DateTime
}
```

### User Progress Collection
```javascript
{
  id: String,
  user_id: String,
  step_number: Number,
  tasks_completed: [String],
  completed_at: DateTime
}
```

### Intake Forms Collection
```javascript
{
  id: String,
  user_id: String,
  form_data: {
    profileData: {
      legalFirstName: String,
      legalLastName: String,
      email: String,
      phone: String,
      dateOfBirth: String,
      gender: String,
      weight: String,
      mainProblems: String,
      hopedOutcome: String,
      // ... additional fields
    },
    hipaaPrintName: String,
    hipaaSignature: String,       // Base64 image
    hipaaSignedAt: DateTime,
    telehealthPrintName: String,
    telehealthSignature: String,  // Base64 image
    telehealthSignedAt: DateTime
  },
  last_saved: DateTime,
  submitted_at: DateTime,
  pdf_link: String
}
```

### Activity Logs Collection
```javascript
{
  id: String,
  event_type: String,            // "USER_LOGIN", "FORM_SUBMITTED", etc.
  user_email: String,
  user_id: String,
  details: Object,
  status: String,                // "success", "failed"
  ip_address: String,
  user_agent: String,
  timestamp: DateTime
}
```

## 🎨 Design System

### Colors
- Background: Off-white (#F4F3F2) with subtle grid pattern
- Primary: Teal (#0D9488, #14B8A6)
- Cards: White with subtle shadow and teal accent line
- Text: Gray-900 for headings, Gray-600 for body
- Success: Green (#10B981)
- Warning: Yellow (#F59E0B)
- Error: Red (#EF4444)

### Typography
- Headings: Space Grotesk
- Body: Inter

### CSS Classes
```css
.bg-grid          /* Subtle grid background pattern */
.card-accent      /* Card with teal left border accent */
.section-divider  /* Subtle horizontal divider */
```

## 🔄 GHL Integration

### Webhook Setup

1. In GoHighLevel, go to Settings → Integrations → Webhooks
2. Create webhook for "Order Completed" event
3. URL: `https://YOUR_DOMAIN.com/api/webhook/ghl`
4. Method: POST
5. Body:
```json
{
  "email": "{{contact.email}}",
  "name": "{{contact.name}}",
  "first_name": "{{contact.first_name}}",
  "last_name": "{{contact.last_name}}"
}
```

### Auto-Login Links

Generate magic links in GHL automations:
```
https://YOUR_DOMAIN.com/auto-login?email={{contact.email}}&token={{custom.login_token}}
```

### Redirect After Purchase

```
https://YOUR_DOMAIN.com/signup?email={{contact.email}}
```

## 🔗 Zapier Integration

On form submission, a webhook is sent to Zapier with:
- User's name
- User's email  
- Generated PDF file

Configure your Zapier webhook URL in the backend code (`server.py`).

## 📦 Deployment

### Files Required for Production

```
backend/
├── server.py
├── requirements.txt
├── .env
├── service_account.json    # Google credentials
└── services/
    ├── google_drive.py
    └── pdf_generator.py

frontend/
├── build/                  # yarn build output
└── .env
```

### Quick Deploy Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
# Ensure service_account.json exists
# Ensure .env is configured

# Frontend
cd frontend
yarn install
yarn build

# Restart services
sudo systemctl restart customer-portal-backend
sudo systemctl reload nginx
```

For detailed deployment instructions, see:
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Quick reference

## 🧪 Testing

### Test Accounts

Admin: `testadmin@test.com` / `test123`

### Create Test User via Webhook

```bash
curl -X POST https://YOUR_DOMAIN/api/webhook/ghl \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "first_name": "Test",
    "last_name": "User"
  }'
```

### Test Form Submission

```bash
API_URL="https://YOUR_DOMAIN"
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"yourpassword"}' \
  | jq -r '.access_token')

curl -X POST "$API_URL/api/user/intake-form/submit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"form_data": {...}}'
```

## 🛠️ Maintenance

### View Logs

```bash
# Backend
sudo journalctl -u customer-portal-backend -f

# Nginx
sudo tail -f /var/log/nginx/error.log
```

### Update Application

```bash
git pull origin main
cd backend && pip install -r requirements.txt
cd ../frontend && yarn install && yarn build
sudo systemctl restart customer-portal-backend
sudo systemctl reload nginx
```

### Backup Database

```bash
mongodump --db customer_portal_db --out /path/to/backup
```

## 🐛 Troubleshooting

### Common Issues

**Dropbox Upload Fails**
- Check `DROPBOX_ACCESS_TOKEN` is set correctly
- Verify the token hasn't expired (regenerate if needed)
- Check `DROPBOX_UPLOAD_FOLDER` path exists in Dropbox
- Check backend logs: `journalctl -u customer-portal-backend -n 100`

**Cloudflare Turnstile "Invalid Domain"**
- Add your domain to Turnstile allowed domains in Cloudflare dashboard

**Multiple Toast Messages**
- Fixed in latest version with toast ID deduplication

### Check Service Status

```bash
sudo systemctl status customer-portal-backend
sudo systemctl status mongod
sudo systemctl status nginx
```

## 📝 Recent Changes

### v2.0 (Latest)
- Custom 3-part intake form replacing Practice Better
- PDF generation with ReportLab (professional table layout)
- Google Drive integration with domain-wide delegation
- Zapier webhook on form submission
- Auto-fill legal names from GHL data
- Validation modal with "Fix" buttons
- Supabase-inspired UI redesign
- Admin reset clears intake forms
- Toast deduplication fix
- Mobile responsiveness improvements

### v1.0 (Initial)
- Basic 7-step wellness program
- JWT authentication
- GHL webhook integration
- Admin dashboard
- Password reset via email

## 📝 License

Proprietary - Dr. Jason Shumard

## 🤝 Support

For technical support:
1. Check the troubleshooting section
2. Review backend logs for errors
3. Verify all environment variables are set
4. Ensure `service_account.json` is properly configured

---

**Built with ❤️ for Dr. Jason Shumard's Diabetes Wellness Program**
