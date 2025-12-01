# Deployment Instructions for portal.drshumard.com
## Server: 3.133.4.201

This guide provides step-by-step instructions to deploy the Wellness Portal to your Lightsail server.

---

## Prerequisites Checklist

✅ Lightsail server: 3.133.4.201  
✅ Domain: portal.drshumard.com (already pointing to server)  
✅ SSH access to server  
✅ Your application code ready  

---

## PART 1: Connect to Server & Prepare Environment

### Step 1: Connect to Your Server
```bash
# Connect via SSH (use your SSH key)
ssh -i /path/to/your-key.pem ubuntu@3.133.4.201

# Or use Lightsail browser SSH from AWS console
```

### Step 2: Update System & Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl wget build-essential

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Yarn
sudo npm install -g yarn

# Verify installations
node --version    # Should be v18.x.x
yarn --version
python3 --version # Should be 3.10+

# Install Python tools
sudo apt install -y python3-pip python3-venv

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## PART 2: Install & Configure MongoDB

### Step 3: Install MongoDB 7.0
```bash
# Import MongoDB GPG key
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod
```

### Step 4: Secure MongoDB
```bash
# Connect to MongoDB
mongosh

# In MongoDB shell, create admin user:
use admin
db.createUser({
  user: "admin",
  pwd: "YOUR_STRONG_ADMIN_PASSWORD",
  roles: ["root"]
})

# Create application database and user
use wellness_portal
db.createUser({
  user: "wellness_user",
  pwd: "YOUR_STRONG_DB_PASSWORD",
  roles: [{ role: "readWrite", db: "wellness_portal" }]
})

exit

# Enable authentication
sudo nano /etc/mongod.conf

# Find and modify the security section (around line 40):
security:
  authorization: enabled

# Save and exit (Ctrl+X, Y, Enter)

# Restart MongoDB
sudo systemctl restart mongod
```

---

## PART 3: Deploy Your Application

### Step 5: Create Application Directory & Upload Code
```bash
# Create directory
sudo mkdir -p /var/www/wellness-portal
sudo chown -R $USER:$USER /var/www/wellness-portal
cd /var/www/wellness-portal
```

**Now upload your code using ONE of these methods:**

**Method A: Using SCP from your local machine**
```bash
# From YOUR LOCAL MACHINE (not the server):
scp -i /path/to/your-key.pem -r /path/to/your/app/* ubuntu@3.133.4.201:/var/www/wellness-portal/
```

**Method B: Using Git**
```bash
# On the server:
cd /var/www/wellness-portal
git clone YOUR_REPO_URL .
```

**Method C: Using SFTP/FileZilla**
- Host: 3.133.4.201
- Username: ubuntu
- Port: 22
- Protocol: SFTP
- Use your SSH key
- Upload all files to: /var/www/wellness-portal/

### Step 6: Configure Environment Variables

**Backend Environment:**
```bash
cd /var/www/wellness-portal/backend
nano .env
```

Add these (replace with YOUR actual values):
```env
MONGO_URL=mongodb://wellness_user:YOUR_STRONG_DB_PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal
DB_NAME=wellness_portal
JWT_SECRET_KEY=your-super-secret-jwt-key-at-least-32-characters-long
WEBHOOK_SECRET=your-webhook-secret-key-change-in-production
RESEND_API_KEY=re_YOUR_RESEND_API_KEY
FRONTEND_URL=https://portal.drshumard.com
```

Save and exit (Ctrl+X, Y, Enter)

**Frontend Environment:**
```bash
cd /var/www/wellness-portal/frontend
nano .env
```

Add this:
```env
REACT_APP_BACKEND_URL=https://portal.drshumard.com
```

Save and exit (Ctrl+X, Y, Enter)

---

## PART 4: Build & Start Applications

### Step 7: Setup Backend
```bash
cd /var/www/wellness-portal/backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Test backend (optional)
# python3 server.py
# Press Ctrl+C to stop

# Deactivate
deactivate
```

### Step 8: Build Frontend
```bash
cd /var/www/wellness-portal/frontend

# Install dependencies
yarn install

# Build production bundle
yarn build

# Verify build folder exists
ls -la build/
```

### Step 9: Setup PM2 Process Manager

**Install serve package:**
```bash
sudo npm install -g serve
```

**Create PM2 configuration:**
```bash
cd /var/www/wellness-portal
nano ecosystem.config.js
```

Add this content:
```javascript
module.exports = {
  apps: [
    {
      name: 'wellness-backend',
      script: '/var/www/wellness-portal/backend/venv/bin/python',
      args: '/var/www/wellness-portal/backend/server.py',
      cwd: '/var/www/wellness-portal/backend',
      interpreter: 'none',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '/var/www/wellness-portal/logs/backend-error.log',
      out_file: '/var/www/wellness-portal/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'wellness-frontend',
      script: 'serve',
      args: '-s build -l 3000',
      cwd: '/var/www/wellness-portal/frontend',
      env: {
        PM2_SERVE_PATH: '/var/www/wellness-portal/frontend/build',
        PM2_SERVE_PORT: 3000,
        PM2_SERVE_SPA: 'true',
      },
      error_file: '/var/www/wellness-portal/logs/frontend-error.log',
      out_file: '/var/www/wellness-portal/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
};
```

**Create logs directory and start services:**
```bash
# Create logs directory
mkdir -p /var/www/wellness-portal/logs

# Start applications
cd /var/www/wellness-portal
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs (optional)
pm2 logs wellness-backend --lines 20
pm2 logs wellness-frontend --lines 20

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# ⚠️ IMPORTANT: Run the command that PM2 outputs (starts with sudo)
```

---

## PART 5: Configure Nginx & SSL

### Step 10: Configure Nginx
```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/wellness-portal
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name portal.drshumard.com;

    # Redirect HTTP to HTTPS (will be configured after SSL)
    # return 301 https://$server_name$request_uri;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for signup retry logic (40+ seconds)
        proxy_connect_timeout 65s;
        proxy_send_timeout 65s;
        proxy_read_timeout 65s;
    }

    # Static files optimization
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Enable Nginx configuration:**
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/wellness-portal /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### Step 11: Setup SSL with Let's Encrypt
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d portal.drshumard.com

# Follow the prompts:
# 1. Enter your email address
# 2. Agree to terms of service
# 3. Choose to redirect HTTP to HTTPS (option 2)
```

**Certbot will automatically:**
- Obtain the SSL certificate
- Update your Nginx configuration
- Enable HTTPS redirect
- Set up auto-renewal

**Verify SSL auto-renewal:**
```bash
# Test renewal
sudo certbot renew --dry-run

# Check timer status
sudo systemctl status certbot.timer
```

---

## PART 6: Verify Deployment

### Step 12: Check Everything is Running
```bash
# Check PM2 processes
pm2 status
# Both wellness-backend and wellness-frontend should show "online"

# Check Nginx
sudo systemctl status nginx

# Check MongoDB
sudo systemctl status mongod

# Test backend API directly
curl http://localhost:8001/api/health
# Should return some JSON

# Test frontend directly
curl http://localhost:3000
# Should return HTML

# Test through Nginx (HTTP)
curl http://portal.drshumard.com
# Should return HTML

# Test through Nginx (HTTPS) - after SSL setup
curl https://portal.drshumard.com
# Should return HTML
```

### Step 13: Open Your Browser
Visit: **https://portal.drshumard.com**

You should see your wellness portal! 🎉

---

## PART 7: Create Admin User

### Step 14: Promote First Admin User
```bash
# First, create a test user via the GHL webhook endpoint
# Replace with your actual webhook secret and email:

curl -X POST "https://portal.drshumard.com/api/webhook/ghl?webhook_secret=your-webhook-secret-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@drshumard.com",
    "name": "Admin User"
  }'

# Then promote to admin
curl -X POST "https://portal.drshumard.com/api/admin/promote-user?email=admin@drshumard.com&secret_key=your-webhook-secret-key-change-in-production"

# Check your email for the password, then login at:
# https://portal.drshumard.com/login
```

---

## Common Issues & Solutions

### Issue 1: Services Not Starting
```bash
# Check PM2 logs
pm2 logs

# Restart services
pm2 restart all

# If backend won't start, check MongoDB connection
pm2 logs wellness-backend --lines 50
```

### Issue 2: Website Not Accessible
```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check if ports are listening
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :8001
sudo netstat -tlnp | grep :3000

# Restart Nginx
sudo systemctl restart nginx
```

### Issue 3: SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew manually if needed
sudo certbot renew

# Check Nginx configuration
sudo nginx -t
```

### Issue 4: MongoDB Connection Errors
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check logs
sudo tail -f /var/log/mongodb/mongod.log

# Restart MongoDB
sudo systemctl restart mongod

# Test connection manually
mongosh "mongodb://wellness_user:YOUR_PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal"
```

---

## Useful Maintenance Commands

### View Logs
```bash
# Application logs
pm2 logs
pm2 logs wellness-backend
pm2 logs wellness-frontend

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

### Restart Services
```bash
# Restart all PM2 processes
pm2 restart all

# Restart specific service
pm2 restart wellness-backend
pm2 restart wellness-frontend

# Restart Nginx
sudo systemctl restart nginx

# Restart MongoDB
sudo systemctl restart mongod
```

### Update Application (Future Updates)
```bash
# Stop services
pm2 stop all

# Pull latest code
cd /var/www/wellness-portal
git pull origin main

# Backend updates
cd backend
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Frontend updates
cd ../frontend
yarn install
yarn build

# Restart services
pm2 restart all
```

### Backup Database
```bash
# Create backup
mongodump --uri="mongodb://wellness_user:YOUR_PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal" \
  --out=~/backups/$(date +%Y%m%d)

# Restore from backup
mongorestore --uri="mongodb://wellness_user:YOUR_PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal" \
  ~/backups/YYYYMMDD/wellness_portal
```

---

## Security Checklist

- [ ] MongoDB authentication enabled
- [ ] Strong passwords for MongoDB users
- [ ] JWT secrets are long and random
- [ ] Webhook secret is secure
- [ ] SSL certificate installed and working
- [ ] Only necessary ports open in Lightsail firewall (22, 80, 443)
- [ ] PM2 startup script enabled
- [ ] Regular backups scheduled
- [ ] Environment variables not committed to Git

---

## Support Contacts

**If you encounter issues:**
1. Check the logs (PM2, Nginx, MongoDB)
2. Review the "Common Issues" section above
3. Contact: admin@drshumard.com

---

## Quick Command Reference

```bash
# Check service status
pm2 status
sudo systemctl status nginx
sudo systemctl status mongod

# View logs
pm2 logs
sudo tail -f /var/log/nginx/error.log

# Restart services
pm2 restart all
sudo systemctl restart nginx

# Update app
cd /var/www/wellness-portal
git pull
cd frontend && yarn build && cd ..
pm2 restart all
```

---

**Deployment Complete!** 🎉

Your wellness portal is now live at: **https://portal.drshumard.com**
