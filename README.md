# Customer Portal - Dr. Jason Shumard Diabetes Wellness Program

A comprehensive customer portal for managing a 7-step diabetes wellness program with step-by-step progression, task tracking, and admin management capabilities.

## 🌟 Features

### User Features
- **Secure Authentication**: JWT-based authentication with refresh tokens
- **Post-Purchase Signup**: Users created via GHL webhook, then complete signup with password
- **7-Step Wellness Journey**: Progressive unlocking system with task completion tracking
- **Interactive Step 1**: Video player + embedded booking calendar for one-on-one consultation
- **Progress Tracking**: Visual step indicators showing completed, current, and locked steps
- **Dashboard**: Overview of current progress, completion percentage, and quick stats
- **Outcome Page**: Celebratory completion page with animations and achievements
- **Password Reset**: Email-based password reset via Resend integration

### Admin Features
- **User Management**: View all users and their current step progress
- **Analytics Dashboard**: Total users, completion rates, and step distribution
- **Progress Reset**: Ability to reset user progress to Step 1
- **Role-Based Access**: Admin-only routes protected by role verification

### Design
- **Glass Morphism**: Modern glass effects with backdrop blur
- **Smooth Animations**: Framer Motion for entrance animations and micro-interactions
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Blue & White Branding**: Clean, professional color scheme
- **Spotify/Airbnb-Inspired UX**: Intuitive navigation and card-based layouts

## 🏗️ Architecture

### Tech Stack

**Frontend**
- React 18
- React Router for navigation
- Tailwind CSS + Shadcn UI components
- Framer Motion for animations
- React Player for video content
- Zustand for state management
- Axios for API calls

**Backend**
- FastAPI (Python)
- MongoDB with Motor (async driver)
- JWT authentication with jose
- Bcrypt for password hashing
- Resend for email notifications

**Infrastructure**
- Nginx (reverse proxy & static file serving)
- Systemd (process management)
- Let's Encrypt (SSL certificates)
- AWS Lightsail (recommended hosting)

### Project Structure

```
/app
├── backend/
│   ├── server.py           # Main FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── pages/         # Route components
│   │   │   ├── Signup.js
│   │   │   ├── Login.js
│   │   │   ├── Dashboard.js
│   │   │   ├── StepsPage.js
│   │   │   ├── AdminDashboard.js
│   │   │   ├── OutcomePage.js
│   │   │   └── ResetPassword.js
│   │   ├── components/    # Reusable components
│   │   │   └── ui/       # Shadcn UI components
│   │   ├── App.js        # Main app component
│   │   └── App.css       # Global styles
│   ├── package.json       # Node dependencies
│   ├── tailwind.config.js # Tailwind configuration
│   └── .env              # Frontend environment variables
├── DEPLOYMENT.md          # Detailed deployment guide
├── DEPLOYMENT_CHECKLIST.md # Quick deployment reference
└── README.md             # This file
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
- `POST /api/webhook/ghl` - Create user from GHL purchase
- `POST /api/auth/signup` - Complete signup with password
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/request-reset` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### User
- `GET /api/user/me` - Get current user info
- `GET /api/user/progress` - Get user progress data
- `POST /api/user/complete-task` - Mark task as complete
- `POST /api/user/advance-step` - Advance to next step

### Admin
- `GET /api/admin/users` - Get all users
- `GET /api/admin/analytics` - Get analytics data
- `POST /api/admin/user/:id/reset` - Reset user progress

## 🔐 Environment Variables

### Backend (.env)

```env
MONGO_URL               # MongoDB connection string
DB_NAME                 # Database name
JWT_SECRET_KEY          # Secret for JWT signing
CORS_ORIGINS            # Allowed CORS origins (comma-separated)
RESEND_API_KEY          # Resend API key for emails
FRONTEND_URL            # Frontend URL for email links
```

### Frontend (.env)

```env
REACT_APP_BACKEND_URL   # Backend API URL
```

## 👥 User Roles

### Regular User
- Access to dashboard
- Progress through 7 steps
- Complete tasks and track progress
- View outcome page upon completion

### Admin User
- All user features
- Access to admin dashboard
- View all users and analytics
- Reset user progress
- View completion statistics

**To create admin user:**
1. Create user via GHL webhook or signup
2. Update MongoDB record: `db.users.update({email: "admin@example.com"}, {$set: {role: "admin"}})`

## 🔄 GHL Integration

### Webhook Setup

1. In GoHighLevel, go to Settings → Integrations → Webhooks
2. Create new webhook for "Order Completed" event
3. Set URL: `https://YOUR_DOMAIN.com/api/webhook/ghl`
4. Set Method: POST
5. Add body:
```json
{
  "email": "{{contact.email}}",
  "name": "{{contact.name}}"
}
```

### Redirect After Purchase

Redirect users to: `https://YOUR_DOMAIN.com/signup?email={{contact.email}}`

Email will be pre-filled and disabled for security.

## 📊 Database Schema

### Users Collection
```javascript
{
  id: String,              // UUID
  email: String,           // Unique
  name: String,
  password_hash: String,
  current_step: Number,    // 1-7
  role: String,           // "user" or "admin"
  reset_token: String,    // Password reset token
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

## 🎨 Design System

### Colors
- Primary: Blue (#2563EB, #3B82F6)
- Secondary: White, Light Blue (#DBEAFE, #EFF6FF)
- Success: Green (#10B981)
- Warning: Yellow (#F59E0B)
- Error: Red (#EF4444)

### Typography
- Headings: Space Grotesk
- Body: Inter

### Components
- Glass morphism cards with backdrop-blur
- Smooth entrance animations
- Hover effects on interactive elements
- Progress indicators with color-coded states
- Responsive grid layouts

## 🧪 Testing

### Test Accounts

Create test users via webhook:
```bash
curl -X POST http://localhost:8001/api/webhook/ghl \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User"}'
```

Then complete signup at: `http://localhost:3000/signup?email=test@example.com`

### Manual Testing Checklist
- [ ] Signup with email parameter
- [ ] Login with credentials
- [ ] Navigate between steps
- [ ] Complete tasks in Step 1
- [ ] Advance to Step 2
- [ ] Access admin dashboard (admin user)
- [ ] Reset user progress (admin)
- [ ] Request password reset
- [ ] Complete all steps and view outcome page

## 📦 Deployment

For production deployment to AWS Lightsail, see:
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Quick reference checklist

Estimated deployment time: **~90 minutes**

## 🛠️ Maintenance

### Update Application
```bash
git pull origin main
cd backend && pip install -r requirements.txt
cd ../frontend && yarn install && yarn build
sudo systemctl restart customer-portal-backend
sudo systemctl reload nginx
```

### View Logs
```bash
# Backend
sudo journalctl -u customer-portal-backend -f

# Nginx
sudo tail -f /var/log/nginx/error.log
```

### Backup Database
```bash
mongodump --db customer_portal_db --out /path/to/backup
```

## 🐛 Troubleshooting

### Backend Issues
```bash
# Check service status
sudo systemctl status customer-portal-backend

# View logs
sudo journalctl -u customer-portal-backend -n 50

# Restart service
sudo systemctl restart customer-portal-backend
```

### Frontend Issues
```bash
# Rebuild
cd /home/appuser/app/frontend
yarn build

# Reload Nginx
sudo systemctl reload nginx
```

### Database Issues
```bash
# Check MongoDB
sudo systemctl status mongod

# Connect to MongoDB
mongosh
> use customer_portal_db
> db.users.find()
```

## 📝 License

Proprietary - Dr. Jason Shumard

## 🤝 Support

For technical support or questions:
- Check the troubleshooting section
- Review logs for error messages
- Verify environment variables are set correctly

---

**Built with ❤️ for Dr. Jason Shumard's Diabetes Wellness Program**
