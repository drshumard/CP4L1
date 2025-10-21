# Customer Portal - AWS Lightsail Deployment Guide

Complete guide to deploy the Dr. Jason Shumard Customer Portal to an AWS Lightsail Debian server.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Install Dependencies](#install-dependencies)
4. [Deploy Application](#deploy-application)
5. [Configure Environment](#configure-environment)
6. [Setup Process Managers](#setup-process-managers)
7. [Configure Nginx](#configure-nginx)
8. [SSL/HTTPS Setup](#ssl-https-setup)
9. [Database Configuration](#database-configuration)
10. [Testing](#testing)
11. [Maintenance](#maintenance)

---

## Prerequisites

### Local Requirements
- Git installed
- SSH key for GitHub (if using private repo)
- Domain name pointed to your server (e.g., portal.drjasonshumard.com)

### AWS Lightsail
- Lightsail instance created (minimum 2GB RAM recommended)
- Operating System: Debian 11 or 12
- Static IP attached to instance
- Ports opened in Lightsail firewall:
  - SSH (22)
  - HTTP (80)
  - HTTPS (443)

---

## Server Setup

### 1. Connect to Your Server

```bash
ssh admin@YOUR_SERVER_IP
# or
ssh -i /path/to/key.pem admin@YOUR_SERVER_IP
```

### 2. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Create Application User

```bash
sudo adduser appuser
sudo usermod -aG sudo appuser
su - appuser
```

---

## Install Dependencies

### 1. Install Node.js 18.x (for React frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v18.x
npm --version
```

### 2. Install Yarn

```bash
sudo npm install -g yarn
yarn --version
```

### 3. Install Python 3.11 and Pip

```bash
sudo apt install -y python3 python3-pip python3-venv
python3 --version  # Should show 3.11.x
```

### 4. Install MongoDB

```bash
# Import MongoDB public GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Create list file
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bullseye/mongodb-org/7.0 main" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Update and install
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
sudo systemctl status mongod
```

### 5. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6. Install Certbot (for SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## Deploy Application

### 1. Clone Repository

```bash
cd /home/appuser
git clone https://github.com/YOUR_USERNAME/customer-portal.git app
cd app

# Or if using private repo
git clone git@github.com:YOUR_USERNAME/customer-portal.git app
```

**Alternative: Upload via SCP**
```bash
# From your local machine
scp -r /path/to/local/app admin@YOUR_SERVER_IP:/home/appuser/
```

### 2. Install Backend Dependencies

```bash
cd /home/appuser/app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies

```bash
cd /home/appuser/app/frontend
yarn install
```

---

## Configure Environment

### 1. Backend Environment (.env)

```bash
cd /home/appuser/app/backend
nano .env
```

Add the following:

```env
# Database
MONGO_URL="mongodb://localhost:27017"
DB_NAME="customer_portal_db"

# Security
JWT_SECRET_KEY="YOUR_SUPER_SECRET_KEY_CHANGE_THIS"
CORS_ORIGINS="https://portal.drjasonshumard.com"

# Email Service (Resend)
RESEND_API_KEY="re_your_resend_api_key_here"

# Frontend URL (for password reset emails)
FRONTEND_URL="https://portal.drjasonshumard.com"
```

**Generate a secure JWT secret:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Frontend Environment (.env)

```bash
cd /home/appuser/app/frontend
nano .env
```

Add:

```env
REACT_APP_BACKEND_URL=https://portal.drjasonshumard.com
```

### 3. Build Frontend

```bash
cd /home/appuser/app/frontend
yarn build
```

This creates an optimized production build in `/home/appuser/app/frontend/build`

---

## Setup Process Managers

### 1. Backend - Create Systemd Service

```bash
sudo nano /etc/systemd/system/customer-portal-backend.service
```

Add:

```ini
[Unit]
Description=Customer Portal Backend (FastAPI)
After=network.target mongod.service

[Service]
Type=simple
User=appuser
WorkingDirectory=/home/appuser/app/backend
Environment="PATH=/home/appuser/app/backend/venv/bin"
ExecStart=/home/appuser/app/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable customer-portal-backend
sudo systemctl start customer-portal-backend
sudo systemctl status customer-portal-backend
```

### 2. Check Backend Logs

```bash
sudo journalctl -u customer-portal-backend -f
```

---

## Configure Nginx

### 1. Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/customer-portal
```

Add:

```nginx
server {
    listen 80;
    server_name portal.drjasonshumard.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend (React build)
    location / {
        root /home/appuser/app/frontend/build;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Increase max upload size
    client_max_body_size 10M;
}
```

### 2. Enable Configuration

```bash
sudo ln -s /etc/nginx/sites-available/customer-portal /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

---

## SSL/HTTPS Setup

### 1. Obtain SSL Certificate

```bash
sudo certbot --nginx -d portal.drjasonshumard.com
```

Follow the prompts:
- Enter email address
- Agree to terms
- Choose to redirect HTTP to HTTPS (recommended)

### 2. Verify Auto-Renewal

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### 3. Updated Nginx Config (Post-SSL)

Certbot will automatically update your Nginx config. Verify:

```bash
sudo nano /etc/nginx/sites-available/customer-portal
```

Should now include:

```nginx
server {
    listen 443 ssl http2;
    server_name portal.drjasonshumard.com;

    ssl_certificate /etc/letsencrypt/live/portal.drjasonshumard.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.drjasonshumard.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ... rest of config
}

server {
    listen 80;
    server_name portal.drjasonshumard.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Database Configuration

### 1. Create Admin User

```bash
cd /home/appuser/app
source backend/venv/bin/activate

python3 << EOF
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def create_admin():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['customer_portal_db']
    
    # Check if admin exists
    admin = await db.users.find_one({'email': 'admin@drjasonshumard.com'})
    
    if not admin:
        await db.users.insert_one({
            'id': 'admin-001',
            'email': 'admin@drjasonshumard.com',
            'name': 'Admin User',
            'password_hash': '',  # Will be set via signup
            'current_step': 1,
            'role': 'admin',
            'created_at': '2024-01-01T00:00:00Z'
        })
        print('✓ Admin user created')
    else:
        print('Admin user already exists')
    
    client.close()

asyncio.run(create_admin())
EOF
```

### 2. Setup Database Backups (Optional but Recommended)

```bash
# Create backup script
sudo nano /usr/local/bin/backup-mongodb.sh
```

Add:

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/appuser/backups/mongodb"
mkdir -p $BACKUP_DIR

mongodump --db customer_portal_db --out $BACKUP_DIR/backup_$TIMESTAMP

# Keep only last 7 days of backups
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: backup_$TIMESTAMP"
```

Make executable and schedule:

```bash
sudo chmod +x /usr/local/bin/backup-mongodb.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-mongodb.sh >> /var/log/mongodb-backup.log 2>&1
```

---

## Testing

### 1. Check Backend API

```bash
curl https://portal.drjasonshumard.com/api/
# Should return: {"message":"API is running"}
```

### 2. Test GHL Webhook

```bash
curl -X POST https://portal.drjasonshumard.com/api/webhook/ghl \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User"}'
```

### 3. Access Frontend

Open browser: `https://portal.drjasonshumard.com`

Should see the login page.

### 4. Complete Signup Flow

1. Create user via webhook or directly in DB
2. Visit: `https://portal.drjasonshumard.com/signup?email=test@example.com`
3. Set password and login
4. Test step navigation

### 5. Monitor Logs

```bash
# Backend logs
sudo journalctl -u customer-portal-backend -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

---

## Maintenance

### Update Application

```bash
cd /home/appuser/app
git pull origin main

# Update backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart customer-portal-backend

# Update frontend
cd ../frontend
yarn install
yarn build
sudo systemctl reload nginx
```

### Restart Services

```bash
# Backend
sudo systemctl restart customer-portal-backend

# Nginx
sudo systemctl restart nginx

# MongoDB
sudo systemctl restart mongod
```

### View Service Status

```bash
sudo systemctl status customer-portal-backend
sudo systemctl status nginx
sudo systemctl status mongod
```

### Disk Space Management

```bash
# Check disk usage
df -h

# Clean old logs
sudo journalctl --vacuum-time=7d

# Clean old backups
find /home/appuser/backups -type f -mtime +30 -delete
```

### Security Updates

```bash
# Regular system updates
sudo apt update && sudo apt upgrade -y

# Update SSL certificates (automatic via certbot)
sudo certbot renew
```

---

## Troubleshooting

### Backend Not Starting

```bash
# Check logs
sudo journalctl -u customer-portal-backend -n 50

# Test manually
cd /home/appuser/app/backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001
```

### Frontend Not Loading

```bash
# Verify build exists
ls -la /home/appuser/app/frontend/build

# Rebuild if needed
cd /home/appuser/app/frontend
yarn build

# Check Nginx config
sudo nginx -t
sudo systemctl status nginx
```

### MongoDB Connection Issues

```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Test connection
mongosh
> show dbs
> use customer_portal_db
> db.users.find()
```

### SSL Certificate Issues

```bash
# Test renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

### 502 Bad Gateway

```bash
# Usually means backend is down
sudo systemctl status customer-portal-backend
sudo systemctl restart customer-portal-backend

# Check if port 8001 is listening
sudo netstat -tlnp | grep 8001
```

---

## Performance Optimization

### 1. Enable Gzip Compression

```bash
sudo nano /etc/nginx/nginx.conf
```

Add in `http` block:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
```

### 2. Increase Backend Workers

Edit systemd service:

```bash
sudo nano /etc/systemd/system/customer-portal-backend.service
```

Change workers based on CPU cores (formula: 2-4 x CPU cores):

```ini
ExecStart=/home/appuser/app/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 4
```

### 3. Setup Redis Cache (Optional)

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

---

## Security Checklist

- [ ] JWT_SECRET_KEY is strong and unique
- [ ] Firewall configured (ports 22, 80, 443 only)
- [ ] SSH key authentication enabled (password disabled)
- [ ] Regular backups scheduled
- [ ] SSL certificate auto-renewal working
- [ ] CORS_ORIGINS set to production domain only
- [ ] MongoDB access restricted to localhost
- [ ] System updates scheduled
- [ ] Application logs rotated
- [ ] Fail2ban installed (optional but recommended)

---

## Additional Resources

- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [React Production Build](https://create-react-app.dev/docs/production-build/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [MongoDB Security](https://www.mongodb.com/docs/manual/security/)
- [Let's Encrypt](https://letsencrypt.org/docs/)

---

## Support

For deployment issues:
1. Check logs first (systemd, nginx, mongodb)
2. Verify environment variables
3. Test each component individually
4. Review firewall and port configurations

---

**Deployment Complete! 🎉**

Your Customer Portal should now be live at `https://portal.drjasonshumard.com`
