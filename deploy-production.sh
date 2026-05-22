#!/bin/bash

# Production Deployment Script for Wellness Portal
# Run this on your EC2 server after git push

set -e  # Exit on any error

echo "🚀 Starting production deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/wellness-portal"
FRONTEND_DIR="$APP_DIR/frontend"
BACKEND_DIR="$APP_DIR/backend"

# Step 1: Pull latest code
echo -e "${YELLOW}📥 Pulling latest code from repository...${NC}"
cd $APP_DIR
git pull origin main

# Step 2: Backend updates
echo -e "${YELLOW}🔧 Updating backend...${NC}"
cd $BACKEND_DIR

# Activate virtual environment and install dependencies
source venv/bin/activate
pip install -r requirements.txt
deactivate

echo -e "${GREEN}✅ Backend dependencies updated${NC}"

# Step 3: Frontend build
echo -e "${YELLOW}🏗️  Building frontend for production...${NC}"
cd $FRONTEND_DIR

# Install dependencies
yarn install

# Build production bundle
yarn build

echo -e "${GREEN}✅ Frontend built successfully${NC}"

# Step 4: Restart services
echo -e "${YELLOW}🔄 Restarting services...${NC}"
cd $APP_DIR
pm2 restart ecosystem.config.js

# Wait for services to start
sleep 5

# Step 5: Check status
echo -e "${YELLOW}📊 Checking service status...${NC}"
pm2 status

# Step 6: Save PM2 config
pm2 save

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}Your app is now running at: https://portal.drshumard.com${NC}"

# Show recent logs
echo -e "${YELLOW}📋 Recent logs:${NC}"
pm2 logs --lines 10 --nostream
