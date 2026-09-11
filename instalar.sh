#!/usr/bin/env bash
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta: sudo bash instalar.sh"
  exit 1
fi

echo "=== Instalando dependencias ==="
apt update
apt install -y nginx ffmpeg nodejs npm unzip curl

echo "=== Instalando PM2 ==="
npm install -g pm2

APP="/var/www/videos-app/backend-vps"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Creando aplicación ==="
mkdir -p "$APP"
if [ "$HERE" != "$APP" ]; then
  cp -r "$HERE"/* "$APP"/
  cp -r "$HERE"/.[!.]* "$APP"/ 2>/dev/null || true
fi

cd "$APP"
mkdir -p uploads hls

echo "=== Instalando Node ==="
npm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "SE CREÓ EL ARCHIVO .env"
  echo "Edita ahora:"
  echo "nano $APP/.env"
  echo ""
fi

echo "=== Configurando Nginx ==="
cp nginx-videos.conf /etc/nginx/sites-available/videos
ln -sf /etc/nginx/sites-available/videos /etc/nginx/sites-enabled/videos
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=== Iniciando API ==="
pm2 delete videos-api >/dev/null 2>&1 || true
pm2 start server.js --name videos-api
pm2 save

echo ""
echo "======================================"
echo " INSTALACIÓN TERMINADA"
echo "======================================"
echo "1) Edita MongoDB y FRONTEND_URL:"
echo "   nano $APP/.env"
echo ""
echo "2) Reinicia:"
echo "   pm2 restart videos-api"
echo ""
echo "3) Prueba:"
echo "   curl http://127.0.0.1:3000/health"
echo ""
