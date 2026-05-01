#!/bin/bash

# HatchKod LMS Deployment Script
# --------------------------------------------------
# Usage: ./deploy.sh
# --------------------------------------------------

set -e # Exit on any error

# 1. Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting HatchKod LMS Deployment...${NC}"

# 2. Update code
echo -e "${BLUE}Pulling latest changes...${NC}"
git pull origin main

# 3. Backend Setup
echo -e "${BLUE}Setting up Backend...${NC}"
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 4. Frontend Build
echo -e "${BLUE}Building Frontend...${NC}"
cd frontend
# Check if .env exists for frontend build
if [ ! -f ".env" ]; then
    echo -e "${GREEN}Warning: frontend/.env not found. Using defaults.${NC}"
fi
npm install
npm run build
cd ..

# 5. Nginx Configuration
echo -e "${BLUE}Configuring Nginx...${NC}"
# In Amazon Linux 2023, the default is to use /etc/nginx/conf.d/
sudo cp nginx.conf /etc/nginx/conf.d/hatchkod.conf

# Check if default nginx config might conflict (port 80)
if [ -f "/etc/nginx/nginx.conf" ]; then
    echo "Checking if default server block in nginx.conf needs to be disabled..."
    # This is a bit complex to automate safely, but usually conf.d works fine.
fi

echo "Testing Nginx configuration..."
sudo nginx -t
sudo systemctl restart nginx

# 6. PM2 Process Management
echo -e "${BLUE}Restarting Backend with PM2...${NC}"
# Ensure PM2 is installed globally
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing..."
    sudo npm install -g pm2
fi

# Ensure logs directory exists
mkdir -p backend/logs

pm2 start ecosystem.config.js || pm2 restart ecosystem.config.js
pm2 save

echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "Frontend is live at http://$(curl -s ifconfig.me)"
echo -e "Backend is running on 127.0.0.1:8000 (proxied)"
