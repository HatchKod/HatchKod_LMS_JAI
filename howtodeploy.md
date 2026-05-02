# HatchKod LMS - EC2 Deployment Guide

This guide provides step-by-step instructions for hosting the HatchKod LMS on an AWS EC2 instance using Nginx and PM2.

## 1. Server Requirements
- **OS**: Ubuntu 22.04 LTS (recommended) or any Debian-based Linux.
- **Hardware**: t3.small (recommended) or t3.micro (minimum).
- **Security Group (Firewall)**:
    - Port 22 (SSH) - for management.
    - Port 80 (HTTP) - for public access.
    - Port 443 (HTTPS) - optional, for SSL.

---

## 2. Install System Dependencies
Connect to your EC2 instance via SSH and run the following commands:

### Update System
```bash
sudo dnf update -y
```

### Install Python, Node.js, and Nginx
```bash
# Python & Virtual Environment
sudo dnf install python3-pip python3-devel -y

# Node.js & NPM
sudo dnf install nodejs npm -y

# Nginx
sudo dnf install nginx -y

# PM2 (Global)
sudo npm install -g pm2
```

---

## 3. Setup Application Code

### Clone Repository
```bash
cd /var/www
# You might need to change ownership to your user first
sudo chown $USER:$USER /var/www
git clone https://github.com/HatchKod/HatchKod_LMS_JAI.git hatchkod
cd hatchkod
```

### Configure Environment Variables
You must create the `.env` files manually as they are not tracked in Git.

**Backend Environment:**
```bash
nano backend/.env
```
Paste your Supabase and JDoodle credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
JWT_SECRET=your-secret-key
ADMIN_EMAIL=admin@hatchkod.com
ADMIN_PASSWORD=your-password
JDOODLE_CLIENT_ID=your-id
JDOODLE_CLIENT_SECRET=your-secret
```

**Frontend Environment:**
```bash
nano frontend/.env
```
Add the backend API proxy path:
```env
REACT_APP_BACKEND_URL=/api
```

---

## 4. Deploy
I have provided a `deploy.sh` script that automates the build and service reload process.

### Make the script executable
```bash
chmod +x deploy.sh
```

### Run the deployment
```bash
./deploy.sh
```

### Enable Automatic Startup (One-time Setup)
To ensure the app starts automatically whenever the EC2 instance reboots:
1. Run: `pm2 startup`
2. Copy and paste the command it gives you into the terminal.
3. Run: `pm2 save`
4. Enable Nginx: `sudo systemctl enable nginx`

The script will:
1. Pull the latest code.
2. Build the React frontend.
3. Install Python dependencies.
4. Configure Nginx reverse proxy.
5. Restart the backend process with PM2.

---

## 5. Post-Deployment & Maintenance

### Verify Status
- **Website**: Visit your EC2 Public IP in a browser.
- **Backend Logs**: `pm2 logs hatchkod-backend`
- **Nginx Logs**: `sudo tail -f /var/log/nginx/error.log`

### Process Management
- **Restart Backend**: pm2 start ecosystem.config.js || pm2 restart ecosystem.config.js
pm2 save

# 7. Enable Startup
echo -e "${BLUE}Ensuring services start on boot...${NC}"
sudo systemctl enable nginx
# Note: User must run 'pm2 startup' once manually to configure systemd
- **Stop Backend**: `pm2 stop hatchkod-backend`
- **View All Processes**: `pm2 status`

### SSL (HTTPS) with Certbot (Optional but Recommended)
To secure your site with HTTPS:
```bash
sudo dnf install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

## Troubleshooting
- **502 Bad Gateway**: Usually means the backend (FastAPI) isn't running. Check `pm2 status`.
- **403 Forbidden**: Check file permissions for `/var/www/hatchkod/frontend/build`.
- **Changes not appearing**: Run `./deploy.sh` again to rebuild the frontend cache.
