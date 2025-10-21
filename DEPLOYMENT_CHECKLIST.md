# Customer Portal - Deployment Checklist

Quick reference checklist for deploying to AWS Lightsail.

## Pre-Deployment

- [ ] AWS Lightsail instance created (Debian 11/12, 2GB+ RAM)
- [ ] Static IP attached to instance
- [ ] Domain DNS A record points to static IP
- [ ] Firewall ports opened: 22, 80, 443
- [ ] SSH access confirmed
- [ ] Resend API key obtained (for password reset emails)

## Server Setup (30 min)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn

# Install Python
sudo apt install -y python3 python3-pip python3-venv

# Install MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bullseye/mongodb-org/7.0 main" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Nginx & Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

## Application Deployment (20 min)

```bash
# Clone/upload application
cd /home/appuser
git clone YOUR_REPO_URL app
cd app

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
yarn install
yarn build
```

## Configuration (10 min)

### Backend .env
```bash
cd /home/appuser/app/backend
nano .env
```

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="customer_portal_db"
JWT_SECRET_KEY="GENERATE_SECURE_KEY_HERE"
CORS_ORIGINS="https://YOUR_DOMAIN.com"
RESEND_API_KEY="re_your_api_key"
FRONTEND_URL="https://YOUR_DOMAIN.com"
```

### Frontend .env
```bash
cd /home/appuser/app/frontend
nano .env
```

```env
REACT_APP_BACKEND_URL=https://YOUR_DOMAIN.com
```

## Process Manager Setup (10 min)

```bash
# Create systemd service
sudo nano /etc/systemd/system/customer-portal-backend.service
```

```ini
[Unit]
Description=Customer Portal Backend
After=network.target mongod.service

[Service]
Type=simple
User=appuser
WorkingDirectory=/home/appuser/app/backend
Environment="PATH=/home/appuser/app/backend/venv/bin"
ExecStart=/home/appuser/app/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable customer-portal-backend
sudo systemctl start customer-portal-backend
```

## Nginx Configuration (10 min)

```bash
sudo nano /etc/nginx/sites-available/customer-portal
```

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    location / {
        root /home/appuser/app/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 10M;
}
```

```bash
# Enable and reload
sudo ln -s /etc/nginx/sites-available/customer-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Setup (5 min)

```bash
sudo certbot --nginx -d YOUR_DOMAIN.com
# Follow prompts, choose redirect HTTP to HTTPS
```

## Database Setup (5 min)

```bash
# Create admin user via webhook or Python script
curl -X POST https://YOUR_DOMAIN.com/api/webhook/ghl \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@yourdomain.com", "name": "Admin User"}'

# Make them admin
cd /home/appuser/app
source backend/venv/bin/activate
python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def make_admin():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['customer_portal_db']
    await db.users.update_one(
        {'email': 'admin@yourdomain.com'},
        {'\$set': {'role': 'admin'}}
    )
    print('Admin created')
    client.close()

asyncio.run(make_admin())
"
```

## Testing Checklist

- [ ] Backend API responds: `curl https://YOUR_DOMAIN.com/api/`
- [ ] Frontend loads: Visit `https://YOUR_DOMAIN.com`
- [ ] Signup flow works with email parameter
- [ ] Login works with test credentials
- [ ] Step 1 loads with video and calendar
- [ ] Step progression works
- [ ] Admin panel accessible (admin user only)
- [ ] Password reset email sends (requires Resend API key)

## Verification Commands

```bash
# Check services
sudo systemctl status customer-portal-backend
sudo systemctl status nginx
sudo systemctl status mongod
sudo systemctl status certbot.timer

# Check logs
sudo journalctl -u customer-portal-backend -f
sudo tail -f /var/log/nginx/error.log

# Check ports
sudo netstat -tlnp | grep -E '(8001|80|443)'

# Test backend directly
curl http://localhost:8001/api/
```

## Common Issues & Fixes

### 502 Bad Gateway
```bash
sudo systemctl restart customer-portal-backend
sudo journalctl -u customer-portal-backend -n 50
```

### Frontend blank page
```bash
cd /home/appuser/app/frontend
yarn build
sudo systemctl reload nginx
```

### MongoDB connection error
```bash
sudo systemctl status mongod
sudo systemctl restart mongod
```

### SSL certificate issues
```bash
sudo certbot renew --dry-run
sudo certbot certificates
```

## Post-Deployment

- [ ] Setup automated backups (see DEPLOYMENT.md)
- [ ] Configure GHL webhook to point to your domain
- [ ] Test complete user journey
- [ ] Monitor logs for first 24 hours
- [ ] Setup monitoring/alerts (optional)
- [ ] Document admin credentials securely

## Quick Update Commands

```bash
# Update application
cd /home/appuser/app
git pull origin main

# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart customer-portal-backend

# Frontend
cd ../frontend
yarn install
yarn build
sudo systemctl reload nginx
```

## Time Estimate

- Server setup: 30 minutes
- Application deployment: 20 minutes
- Configuration: 10 minutes
- Process manager: 10 minutes
- Nginx setup: 10 minutes
- SSL setup: 5 minutes
- Database setup: 5 minutes
- Testing: 10 minutes

**Total: ~90 minutes** (first time)

---

**Ready to deploy? Start with DEPLOYMENT.md for detailed instructions!**
