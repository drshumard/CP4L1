# AWS Lightsail Deployment Guide - Ubuntu with PM2

Complete guide to deploy the Wellness Portal (React + FastAPI + MongoDB) on AWS Lightsail.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Create AWS Lightsail Instance](#step-1-create-aws-lightsail-instance)
3. [Step 2: Initial Server Setup](#step-2-initial-server-setup)
4. [Step 3: Install Dependencies](#step-3-install-dependencies)
5. [Step 4: Setup MongoDB](#step-4-setup-mongodb)
6. [Step 5: Deploy Application Code](#step-5-deploy-application-code)
7. [Step 6: Configure Environment Variables](#step-6-configure-environment-variables)
8. [Step 7: Build Frontend](#step-7-build-frontend)
9. [Step 8: Setup PM2](#step-8-setup-pm2)
10. [Step 9: Configure Nginx](#step-9-configure-nginx)
11. [Step 10: SSL Setup (Optional)](#step-10-ssl-setup-optional)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- AWS Account
- Domain name (optional, for custom domain)
- SSH client (Terminal on Mac/Linux, PuTTY on Windows)
- Git repository with your code OR code files ready to upload

---

## Step 1: Create AWS Lightsail Instance

### 1.1 Create Instance
```bash
1. Log into AWS Console
2. Navigate to Lightsail
3. Click "Create instance"
4. Select:
   - Platform: Linux/Unix
   - Blueprint: OS Only → Ubuntu 22.04 LTS
   - Plan: Choose based on needs (Start with $10-$20/month plan)
   - Instance name: wellness-portal
5. Click "Create instance"
```

### 1.2 Configure Networking
```bash
1. Go to instance → Networking tab
2. Add firewall rules:
   - HTTP: TCP 80
   - HTTPS: TCP 443
   - Custom: TCP 8001 (Backend API)
   - Custom: TCP 3000 (React dev server, optional)
```

### 1.3 Create Static IP
```bash
1. Go to Networking → Create static IP
2. Attach to your instance
3. Note the IP address (e.g., 3.xx.xxx.xxx)
```

---

## Step 2: Initial Server Setup

### 2.1 Connect to Server
```bash
# Download SSH key from Lightsail console
# Then connect:
ssh -i /path/to/your-key.pem ubuntu@YOUR_STATIC_IP

# Or use Lightsail's browser-based SSH
```

### 2.2 Update System
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl wget build-essential
```

### 2.3 Create Application User (Optional but recommended)
```bash
sudo adduser appuser
sudo usermod -aG sudo appuser
su - appuser
```

---

## Step 3: Install Dependencies

### 3.1 Install Node.js 18.x
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be v18.x.x
npm --version
```

### 3.2 Install Yarn
```bash
sudo npm install -g yarn
yarn --version
```

### 3.3 Install Python 3.10+
```bash
# Ubuntu 22.04 comes with Python 3.10
python3 --version

# Install pip and venv
sudo apt install -y python3-pip python3-venv
pip3 --version
```

### 3.4 Install PM2
```bash
sudo npm install -g pm2
pm2 --version
```

### 3.5 Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Step 4: Setup MongoDB

### 4.1 Install MongoDB
```bash
# Import MongoDB GPG key
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
   --dearmor

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod
```

### 4.2 Secure MongoDB
```bash
# Connect to MongoDB
mongosh

# Create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "STRONG_PASSWORD_HERE",
  roles: ["root"]
})

# Create application database and user
use wellness_portal
db.createUser({
  user: "wellness_user",
  pwd: "STRONG_PASSWORD_HERE",
  roles: [{ role: "readWrite", db: "wellness_portal" }]
})

exit

# Enable authentication
sudo nano /etc/mongod.conf

# Add/modify these lines:
security:
  authorization: enabled

# Restart MongoDB
sudo systemctl restart mongod
```

---

## Step 5: Deploy Application Code

### 5.1 Create Application Directory
```bash
sudo mkdir -p /var/www/wellness-portal
sudo chown -R $USER:$USER /var/www/wellness-portal
cd /var/www/wellness-portal
```

### 5.2 Clone or Upload Code

**Option A: Clone from Git**
```bash
git clone YOUR_REPO_URL .
```

**Option B: Upload via SCP**
```bash
# From your local machine:
scp -i /path/to/your-key.pem -r /path/to/app/* ubuntu@YOUR_STATIC_IP:/var/www/wellness-portal/
```

**Option C: Use SFTP or FileZilla**
```bash
# Use FileZilla with SFTP
# Host: YOUR_STATIC_IP
# Username: ubuntu
# Key file: your-key.pem
# Port: 22
```

### 5.3 Verify Structure
```bash
cd /var/www/wellness-portal
ls -la

# Should see:
# backend/
# frontend/
# README.md
# etc.
```

---

## Step 6: Configure Environment Variables

### 6.1 Backend Environment
```bash
cd /var/www/wellness-portal/backend

# Create .env file
nano .env

# Add the following (adjust values):
MONGO_URL=mongodb://wellness_user:STRONG_PASSWORD_HERE@localhost:27017/wellness_portal?authSource=wellness_portal
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars
WEBHOOK_SECRET=your-webhook-secret-key
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com

# Save and exit (Ctrl+X, Y, Enter)
```

### 6.2 Frontend Environment
```bash
cd /var/www/wellness-portal/frontend

# Create .env file
nano .env

# Add the following:
REACT_APP_BACKEND_URL=http://YOUR_STATIC_IP

# Or if using domain:
REACT_APP_BACKEND_URL=https://yourdomain.com

# Save and exit
```

---

## Step 7: Build Frontend

### 7.1 Install Dependencies
```bash
cd /var/www/wellness-portal/frontend
yarn install
```

### 7.2 Build Production Bundle
```bash
yarn build

# This creates a 'build' folder with optimized production files
ls -la build/
```

---

## Step 8: Setup PM2

### 8.1 Install Backend Dependencies
```bash
cd /var/www/wellness-portal/backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Test backend manually (optional)
python3 server.py
# Press Ctrl+C to stop

deactivate
```

### 8.2 Create PM2 Ecosystem File
```bash
cd /var/www/wellness-portal

# Create ecosystem.config.js
nano ecosystem.config.js
```

**Add this content:**
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
      max_memory_restart: '500M',
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

### 8.3 Install serve for Frontend
```bash
sudo npm install -g serve
```

### 8.4 Create Logs Directory
```bash
mkdir -p /var/www/wellness-portal/logs
```

### 8.5 Start Applications with PM2
```bash
cd /var/www/wellness-portal

# Start all apps
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs wellness-backend --lines 50
pm2 logs wellness-frontend --lines 50

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (starts with sudo)
```

### 8.6 Useful PM2 Commands
```bash
# View all processes
pm2 list

# View logs
pm2 logs
pm2 logs wellness-backend
pm2 logs wellness-frontend

# Restart apps
pm2 restart wellness-backend
pm2 restart wellness-frontend
pm2 restart all

# Stop apps
pm2 stop wellness-backend
pm2 stop all

# Delete apps
pm2 delete wellness-backend
pm2 delete all

# Monitor
pm2 monit
```

---

## Step 9: Configure Nginx

### 9.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/wellness-portal
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name YOUR_STATIC_IP;  # Or yourdomain.com

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
        
        # Increase timeouts for long requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files optimization
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 9.2 Enable Configuration
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/wellness-portal /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 9.3 Verify Deployment
```bash
# Check if services are running
pm2 status
sudo systemctl status nginx
sudo systemctl status mongod

# Test backend
curl http://localhost:8001/api/health

# Test frontend
curl http://localhost:3000

# Test through Nginx
curl http://YOUR_STATIC_IP
```

---

## Step 10: SSL Setup (Optional)

### 10.1 Prerequisites
- Domain name pointed to your Lightsail static IP
- Ports 80 and 443 open in firewall

### 10.2 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 10.3 Obtain SSL Certificate
```bash
# Update Nginx config with your domain first
sudo nano /etc/nginx/sites-available/wellness-portal
# Change server_name to: yourdomain.com www.yourdomain.com

# Reload Nginx
sudo systemctl reload nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose redirect option (recommended)
```

### 10.4 Auto-Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot auto-renewal is set up via systemd timer
sudo systemctl status certbot.timer
```

### 10.5 Update Frontend .env
```bash
nano /var/www/wellness-portal/frontend/.env

# Change to HTTPS:
REACT_APP_BACKEND_URL=https://yourdomain.com

# Rebuild frontend
cd /var/www/wellness-portal/frontend
yarn build

# Restart frontend
pm2 restart wellness-frontend
```

---

## Troubleshooting

### Backend Not Starting
```bash
# Check logs
pm2 logs wellness-backend --lines 100

# Common issues:
# 1. MongoDB connection - verify MONGO_URL
# 2. Missing dependencies - reinstall requirements.txt
# 3. Port already in use - check with: sudo lsof -i :8001

# Manual test
cd /var/www/wellness-portal/backend
source venv/bin/activate
python3 server.py
```

### Frontend Not Loading
```bash
# Check logs
pm2 logs wellness-frontend --lines 100

# Verify build exists
ls -la /var/www/wellness-portal/frontend/build

# Rebuild if needed
cd /var/www/wellness-portal/frontend
yarn build
pm2 restart wellness-frontend
```

### MongoDB Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Test connection
mongosh "mongodb://wellness_user:PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal"
```

### Nginx Errors
```bash
# Check Nginx status
sudo systemctl status nginx

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Test configuration
sudo nginx -t

# Common fixes:
sudo systemctl restart nginx
```

### Port Already in Use
```bash
# Find process using port
sudo lsof -i :8001  # Backend
sudo lsof -i :3000  # Frontend

# Kill process
sudo kill -9 PID
```

### Application Not Accessible
```bash
# Check firewall rules in Lightsail console
# Ensure ports 80, 443 are open

# Check if services are listening
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :8001
sudo netstat -tlnp | grep :3000
```

---

## Maintenance Commands

### Update Application Code
```bash
cd /var/www/wellness-portal

# Pull latest code
git pull origin main

# Backend updates
cd backend
source venv/bin/activate
pip install -r requirements.txt
deactivate
pm2 restart wellness-backend

# Frontend updates
cd ../frontend
yarn install
yarn build
pm2 restart wellness-frontend
```

### View Application Logs
```bash
# PM2 logs
pm2 logs

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

### Backup Database
```bash
# Create backup directory
mkdir -p ~/backups

# Backup MongoDB
mongodump --uri="mongodb://wellness_user:PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal" --out=~/backups/$(date +%Y%m%d)

# Restore from backup
mongorestore --uri="mongodb://wellness_user:PASSWORD@localhost:27017/wellness_portal?authSource=wellness_portal" ~/backups/20231201/wellness_portal
```

### Monitor Resources
```bash
# CPU and Memory
htop

# Disk usage
df -h

# PM2 monitoring
pm2 monit
```

---

## Performance Optimization

### Enable Gzip in Nginx
```bash
sudo nano /etc/nginx/nginx.conf

# Add in http block:
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;

sudo systemctl reload nginx
```

### Increase PM2 Limits
```bash
# Edit ecosystem.config.js
nano /var/www/wellness-portal/ecosystem.config.js

# Increase max_memory_restart if needed
max_memory_restart: '1G'  # Instead of 500M

pm2 restart all
```

---

## Security Best Practices

1. **Firewall**: Only open necessary ports (22, 80, 443)
2. **SSH**: Use key-based authentication, disable password login
3. **MongoDB**: Always use authentication, bind to localhost only
4. **Environment Variables**: Never commit .env files to Git
5. **Updates**: Regularly update system packages
6. **Backups**: Set up automated database backups
7. **SSL**: Always use HTTPS in production
8. **Monitoring**: Set up CloudWatch or similar monitoring

---

## Support & Resources

- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **Nginx Docs**: https://nginx.org/en/docs/
- **MongoDB Docs**: https://www.mongodb.com/docs/
- **AWS Lightsail**: https://lightsail.aws.amazon.com/ls/docs/

---

## Quick Reference Commands

```bash
# PM2
pm2 status
pm2 logs
pm2 restart all
pm2 save

# Nginx
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t

# MongoDB
sudo systemctl status mongod
mongosh

# Application
cd /var/www/wellness-portal
git pull
cd frontend && yarn build && cd ..
pm2 restart all
```

---

**Deployment Complete!** 🎉

Your wellness portal should now be accessible at:
- **Frontend**: http://YOUR_STATIC_IP or https://yourdomain.com
- **Backend API**: http://YOUR_STATIC_IP/api or https://yourdomain.com/api
