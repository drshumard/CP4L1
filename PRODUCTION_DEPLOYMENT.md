# Production Deployment Guide

## 🚨 Critical Issue Fixed

Your production server was running the **development server** instead of the production build. This has been fixed.

---

## Initial Setup (One-time on EC2)

### 1. Copy Files to EC2
```bash
# Copy ecosystem.config.js to your server
scp ecosystem.config.js ubuntu@3.133.4.201:/var/www/wellness-portal/

# Copy deployment script
scp deploy-production.sh ubuntu@3.133.4.201:/var/www/wellness-portal/

# Make deployment script executable
ssh ubuntu@3.133.4.201
cd /var/www/wellness-portal
chmod +x deploy-production.sh
```

### 2. Install serve (if not already installed)
```bash
sudo npm install -g serve
```

### 3. Stop Current PM2 Processes
```bash
pm2 delete all
```

### 4. Build Frontend for First Time
```bash
cd /var/www/wellness-portal/frontend
yarn install
yarn build
```

### 5. Start with New Config
```bash
cd /var/www/wellness-portal
pm2 start ecosystem.config.js
pm2 save
```

---

## Regular Deployment Workflow

### On Your Local Machine:

```bash
# 1. Make your changes
# 2. Commit to git
git add .
git commit -m "Your changes"

# 3. Push to repository
git push origin main
```

### On Your EC2 Server:

```bash
# SSH into server
ssh ubuntu@3.133.4.201

# Run deployment script
cd /var/www/wellness-portal
./deploy-production.sh
```

That's it! The script handles everything automatically.

---

## Manual Deployment Steps (if script fails)

```bash
# 1. Pull code
cd /var/www/wellness-portal
git pull origin main

# 2. Update backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 3. Build frontend
cd ../frontend
yarn install
yarn build

# 4. Restart services
cd ..
pm2 restart ecosystem.config.js
pm2 save

# 5. Check status
pm2 status
pm2 logs --lines 20
```

---

## Verify Production Mode

### Check you're NOT seeing webpack warnings:
```bash
pm2 logs wellness-frontend --lines 20
```

**❌ BAD (Development mode):**
```
DeprecationWarning: 'onAfterSetupMiddleware' option is deprecated
```

**✅ GOOD (Production mode):**
```
Accepting connections at http://localhost:3000
```

### Check Service Status:
```bash
pm2 status
```

Both services should show status: **online**

---

## Troubleshooting

### Frontend Not Starting:
```bash
# Check if build exists
ls -la /var/www/wellness-portal/frontend/build/

# Rebuild
cd /var/www/wellness-portal/frontend
rm -rf build/
yarn build

# Restart
pm2 restart wellness-frontend
```

### Backend Errors:
```bash
# Check backend logs
pm2 logs wellness-backend --err --lines 50

# Check if MongoDB is running
sudo systemctl status mongod

# Restart backend
pm2 restart wellness-backend
```

### Nginx Errors (Connection Refused):
```bash
# Check if services are actually running
pm2 status

# Check if ports are listening
sudo netstat -tlnp | grep -E ':3000|:8001'

# Restart Nginx
sudo systemctl restart nginx
```

---

## Production Checklist

Before deploying:
- [ ] Code tested locally
- [ ] Environment variables set in backend/.env and frontend/.env
- [ ] Database migrations applied (if any)
- [ ] SSL certificate valid (check expiry)
- [ ] Backup database before major changes

After deploying:
- [ ] Check `pm2 status` - both services online
- [ ] Check `pm2 logs` - no errors
- [ ] Test login flow
- [ ] Test signup flow
- [ ] Test Step 1, 2, 3 navigation
- [ ] Test on mobile device
- [ ] Check activity logs work

---

## Emergency Rollback

If deployment breaks something:

```bash
# 1. Go back to previous git commit
cd /var/www/wellness-portal
git log --oneline -5  # Find previous commit
git reset --hard <commit-hash>

# 2. Rebuild and restart
./deploy-production.sh
```

---

## Monitoring

### Real-time logs:
```bash
# All logs
pm2 logs

# Just backend
pm2 logs wellness-backend

# Just frontend
pm2 logs wellness-frontend

# Last 100 lines
pm2 logs --lines 100
```

### Service metrics:
```bash
pm2 monit
```

---

## Notes

- The `ecosystem.config.js` configures PM2 to serve the **production build**, not dev server
- Frontend now serves from `build/` folder using `serve` package
- No more webpack warnings in logs
- Much better performance and stability
- All changes are git-tracked for easy rollback
