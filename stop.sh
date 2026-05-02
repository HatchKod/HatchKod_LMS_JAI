#!/bin/bash

# HatchKod LMS Stop Script
# --------------------------------------------------

RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping HatchKod LMS...${NC}"

# 1. Stop PM2 Backend
pm2 stop all

# 2. Stop Nginx
sudo systemctl stop nginx

echo -e "${RED}Application stopped.${NC}"
