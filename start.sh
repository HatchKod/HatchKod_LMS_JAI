#!/bin/bash

# HatchKod LMS Start Script
# --------------------------------------------------
# This script starts the application services without rebuilding.
# --------------------------------------------------

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting HatchKod LMS...${NC}"

# 1. Start Nginx
echo "Starting Nginx..."
sudo systemctl start nginx

# 2. Start Backend with PM2
echo "Starting PM2 processes..."
pm2 start ecosystem.config.js || pm2 start all

echo -e "${GREEN}Application started!${NC}"
pm2 status
