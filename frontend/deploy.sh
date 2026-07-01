#!/usr/bin/env bash
# Movie Controller frontend — Next.js + PM2 + nginx (control.thatinsaneguy.com)
#
#   sudo bash ./deploy.sh
#   ./deploy.sh --build-only
#   ./deploy.sh --skip-nginx
#   sudo bash ./deploy.sh --nginx-only
#
# Prerequisites:
#   • DNS: control.thatinsaneguy.com → this host
#   • Router: TCP 80 and 443 → this host
#   • nginx, Node.js, npm, PM2
#
# Non-interactive Certbot:
#   export CERTBOT_EMAIL='you@example.com'
#   sudo bash ./deploy.sh
#
# Env: FRONTEND_DOMAIN, FRONTEND_PORT, NEXT_PUBLIC_BACKEND_URL, CERTBOT_EMAIL

set -euo pipefail

FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-control.thatinsaneguy.com}"
FRONTEND_PORT="${FRONTEND_PORT:-9280}"
PM2_NAME="${PM2_NAME:-moviecontroller-frontend}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../deploy-lib.sh
source "${SCRIPT_DIR}/../../deploy-lib.sh"
cd "$SCRIPT_DIR"

NGINX_AVAILABLE="/etc/nginx/sites-available/${FRONTEND_DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${FRONTEND_DOMAIN}"
LE_CERT="/etc/letsencrypt/live/${FRONTEND_DOMAIN}/fullchain.pem"
HTTP_NGINX_SRC="${SCRIPT_DIR}/nginx/${FRONTEND_DOMAIN}.conf.http-only"
HTTPS_NGINX_SRC="${SCRIPT_DIR}/nginx/${FRONTEND_DOMAIN}.conf.example"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step()   { echo -e "${BLUE}[moviecontroller-app]${NC} $*"; }
info()   { echo -e "${GREEN}[moviecontroller-app]${NC} $*"; }
warn()   { echo -e "${YELLOW}[moviecontroller-app]${NC} $*" >&2; }
err()    { echo -e "${RED}[moviecontroller-app]${NC} $*" >&2; }
banner() {
  echo ""
  echo -e "${CYAN}================================================================================${NC}"
  echo -e "${CYAN} $*${NC}"
  echo -e "${CYAN}================================================================================${NC}"
  echo ""
}

source_env_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  local tmp
  tmp="$(mktemp)"
  sed 's/\r$//' "$f" > "$tmp"
  set -a
  # shellcheck source=/dev/null
  source "$tmp"
  set +a
  rm -f "$tmp"
}

deploy_owner() {
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
    id -un "${SUDO_USER}"
  else
    id -un
  fi
}

fix_project_ownership() {
  local owner
  owner="$(deploy_owner)"
  if [ "$(id -un)" = "$owner" ]; then
    return 0
  fi
  step "Fix project ownership for ${owner} (node_modules, .next)"
  chown -R "${owner}:${owner}" \
    "${SCRIPT_DIR}/node_modules" \
    "${SCRIPT_DIR}/.next" \
    "${SCRIPT_DIR}/package-lock.json" 2>/dev/null || true
}

fix_next_build_ownership() {
  local owner
  owner="$(deploy_owner)"
  if [ "$(id -un)" = "$owner" ]; then
    return 0
  fi
  step "Fix .next ownership for ${owner}"
  chown -R "${owner}:${owner}" "${SCRIPT_DIR}/.next"
}

nginx_install_rendered() {
  local src="$1" dest="$2"
  sed "s/__FRONTEND_PORT__/${FRONTEND_PORT}/g" "$src" | tee "$dest" >/dev/null
}

run_certbot() {
  if ! command -v certbot &>/dev/null; then
    err "certbot not installed. Install certbot, then:"
    err "  certbot --nginx -d ${FRONTEND_DOMAIN} --redirect"
    return 1
  fi
  step "Let's Encrypt (Certbot)"
  local certbot_args=(--nginx -d "${FRONTEND_DOMAIN}" --agree-tos --non-interactive --redirect)
  if [ -n "${CERTBOT_EMAIL:-}" ]; then
    certbot_args+=(--email "${CERTBOT_EMAIL}")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi
  certbot "${certbot_args[@]}" 2>/dev/null \
    || printf '\n1\n' | certbot --nginx -d "${FRONTEND_DOMAIN}" 2>/dev/null \
    || {
      warn "Certbot issue for ${FRONTEND_DOMAIN} — check manually"
      return 1
    }
}

deploy_nginx_ssl() {
  if [ "$(id -u)" -ne 0 ]; then
    err "nginx/certbot requires root. Run: sudo bash ${SCRIPT_DIR}/deploy.sh"
    return 1
  fi
  if [ ! -f "${HTTP_NGINX_SRC}" ] || [ ! -f "${HTTPS_NGINX_SRC}" ]; then
    err "Missing nginx templates under ${SCRIPT_DIR}/nginx/"
    return 1
  fi
  if ! command -v nginx &>/dev/null; then
    err "nginx not found. Install nginx or use --skip-nginx."
    return 1
  fi

  banner "Nginx + SSL (${FRONTEND_DOMAIN})"

  step "Install nginx vhost (${FRONTEND_DOMAIN}) → 127.0.0.1:${FRONTEND_PORT}"
  if le_cert_exists "${FRONTEND_DOMAIN}"; then
    info "Certificate found — HTTPS template."
    nginx_install_rendered "${HTTPS_NGINX_SRC}" "$NGINX_AVAILABLE"
  else
    info "No cert yet — HTTP-only for Certbot."
    nginx_install_rendered "${HTTP_NGINX_SRC}" "$NGINX_AVAILABLE"
  fi

  mkdir -p /etc/nginx/sites-enabled
  ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

  step "nginx test + reload"
  nginx -t
  systemctl reload nginx 2>/dev/null || service nginx reload

  if ! le_cert_exists "${FRONTEND_DOMAIN}"; then
    run_certbot
    step "Apply production nginx template (HTTPS + redirect)"
    nginx_install_rendered "${HTTPS_NGINX_SRC}" "$NGINX_AVAILABLE"
    nginx -t
    systemctl reload nginx 2>/dev/null || service nginx reload
  else
    info "Certificate exists — skipped certbot."
  fi
}

BUILD_ONLY=0
SKIP_PM2=0
SKIP_NGINX=0
NGINX_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --skip-pm2) SKIP_PM2=1 ;;
    --skip-nginx|--docker-only) SKIP_NGINX=1 ;;
    --nginx-only) NGINX_ONLY=1 ;;
    -h|--help)
      echo "Usage: $0 [--build-only] [--skip-pm2] [--skip-nginx] [--nginx-only]"
      echo "  Env: FRONTEND_DOMAIN, FRONTEND_PORT, NEXT_PUBLIC_BACKEND_URL, CERTBOT_EMAIL"
      exit 0
      ;;
    *)
      err "Unknown option: ${arg}"
      exit 1
      ;;
  esac
done

START_TS=$(date +%s)

if [ "$NGINX_ONLY" -eq 1 ]; then
  deploy_nginx_ssl
  ELAPSED=$(( $(date +%s) - START_TS ))
  banner "Deploy summary (${ELAPSED}s)"
  info "Done — https://${FRONTEND_DOMAIN}/"
  exit 0
fi

banner "Movie Controller frontend (${FRONTEND_DOMAIN})"

if ! command -v node &>/dev/null; then
  err "Node.js is not installed."
  exit 1
fi
if ! command -v npm &>/dev/null; then
  err "npm is not installed."
  exit 1
fi

step "DNS check for ${FRONTEND_DOMAIN}"
if command -v dig &>/dev/null; then
  ips="$(dig +short A "${FRONTEND_DOMAIN}" 2>/dev/null | head -3 || true)"
  if [ -z "${ips}" ]; then
    warn "No A record for ${FRONTEND_DOMAIN} — Certbot may fail until DNS is set."
  else
    info "A record: ${ips}"
  fi
fi

if [ "$SKIP_NGINX" -eq 0 ]; then
  if [ ! -f "${HTTP_NGINX_SRC}" ] || [ ! -f "${HTTPS_NGINX_SRC}" ]; then
    err "Missing nginx templates under ${SCRIPT_DIR}/nginx/"
    exit 1
  fi
fi

if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
  if [ -f ".env.example" ]; then
    warn "No .env or .env.local — copy .env.example to .env"
  else
    warn "No .env or .env.local found"
  fi
elif [ -f ".env" ] && [ ! -f ".env.local" ]; then
  info "Using .env (no .env.local — that's fine)"
fi

source_env_file ".env"
source_env_file ".env.local"

export NODE_ENV=production
export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://192.168.0.53:9281}"

fix_project_ownership

step "Install dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

step "Build (NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL})"
npm run build
fix_next_build_ownership

if [ "$BUILD_ONLY" -eq 1 ]; then
  ELAPSED=$(( $(date +%s) - START_TS ))
  banner "Deploy summary (${ELAPSED}s)"
  info "Build only — run: NODE_ENV=production npm run start -- -p ${FRONTEND_PORT} -H 127.0.0.1"
  exit 0
fi

if [ "$SKIP_PM2" -eq 1 ]; then
  ELAPSED=$(( $(date +%s) - START_TS ))
  banner "Deploy summary (${ELAPSED}s)"
  info "Build complete (SKIP_PM2)."
  exit 0
fi

if ! command -v pm2 &>/dev/null; then
  err "PM2 is not installed. Install: npm install -g pm2"
  exit 1
fi

step "Freeing port ${FRONTEND_PORT}"
for pid in $(lsof -t -i ":${FRONTEND_PORT}" 2>/dev/null || true); do
  kill "${pid}" 2>/dev/null || true
done
sleep 1

pm2_as_owner() {
  local owner
  owner="$(deploy_owner)"
  if [ "$(id -un)" != "$owner" ]; then
    sudo -u "$owner" pm2 "$@"
  else
    pm2 "$@"
  fi
}

start_with_pm2() {
  pm2_as_owner delete "$PM2_NAME" >/dev/null 2>&1 || true
  pm2_as_owner start npm \
    --name "$PM2_NAME" \
    --cwd "$SCRIPT_DIR" \
    -- run start -- -p "${FRONTEND_PORT}" -H 127.0.0.1
  pm2_as_owner save >/dev/null 2>&1 || true
}

step "Starting PM2 (${PM2_NAME}) on 127.0.0.1:${FRONTEND_PORT}"
start_with_pm2

sleep 2
if pm2_as_owner list 2>/dev/null | grep -q "${PM2_NAME}.*online"; then
  info "PM2 process online"
else
  err "PM2 process failed to start. Check: pm2 logs ${PM2_NAME}"
  exit 1
fi

if [ "$SKIP_NGINX" -eq 1 ]; then
  ELAPSED=$(( $(date +%s) - START_TS ))
  banner "Deploy summary (${ELAPSED}s)"
  info "Skipping nginx/Certbot (--skip-nginx). URL: http://127.0.0.1:${FRONTEND_PORT}/"
  exit 0
fi

if [ "$(id -u)" -eq 0 ]; then
  deploy_nginx_ssl
else
  warn "Not root — skipping nginx/certbot. Parent deploy runs these as root, or use: sudo bash ${SCRIPT_DIR}/deploy.sh"
fi

ELAPSED=$(( $(date +%s) - START_TS ))
banner "Deploy summary (${ELAPSED}s)"
info "Done — https://${FRONTEND_DOMAIN}/"
info "Backend API: ${NEXT_PUBLIC_BACKEND_URL}"

cat <<EOF

Useful commands:
  pm2 status
  pm2 logs ${PM2_NAME}
  pm2 restart ${PM2_NAME}
EOF
