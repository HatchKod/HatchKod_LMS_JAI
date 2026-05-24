#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Pulling latest code from git..."
git -C "$SCRIPT_DIR/.." pull

echo "==> Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "==> Installing dependencies..."
pip install -r requirements.txt

echo "==> Creating logs directory..."
mkdir -p logs

echo "==> Starting/reloading app with PM2..."
pm2 describe hatchkod-backend > /dev/null 2>&1 \
  && pm2 reload ecosystem.config.js --update-env \
  || pm2 start ecosystem.config.js --update-env
pm2 save

echo "==> Copying nginx config..."
sudo cp nginx.conf /etc/nginx/conf.d/hatchkod.conf
sudo nginx -t && sudo systemctl reload nginx

echo "==> Done. Backend is live."
