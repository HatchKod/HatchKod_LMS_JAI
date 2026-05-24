#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "========================================"
echo "  HatchKod Backend — Deploy"
echo "========================================"

echo ""
echo "[1/5] Pulling latest code..."
git -C "$SCRIPT_DIR/.." fetch origin
git -C "$SCRIPT_DIR/.." reset --hard origin/main

echo ""
echo "[2/5] Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo ""
echo "[3/5] Installing dependencies..."
pip install -r requirements.txt --quiet

echo ""
echo "[4/5] Creating logs directory..."
mkdir -p logs

echo ""
echo "[5/5] Restarting backend process..."
pm2 describe hatchkod-backend > /dev/null 2>&1 \
  && pm2 reload hatchkod-backend --update-env \
  || pm2 start ecosystem.config.js --update-env
pm2 save

echo ""
echo "========================================"
echo "  Service Status"
echo "========================================"

pm2 list

echo ""
if sudo systemctl is-active --quiet nginx; then
  echo "nginx:    running"
else
  echo "nginx:    STOPPED — run: sudo systemctl start nginx"
fi

if sudo systemctl is-active --quiet certbot-renew.timer; then
  echo "certbot:  auto-renew active"
else
  echo "certbot:  auto-renew INACTIVE — run: sudo systemctl enable --now certbot-renew.timer"
fi

echo ""
echo "Deploy complete. Live at https://api.hatchkod.in"
echo ""
