#!/usr/bin/env bash
# Movie Controller frontend — Next.js + PM2
#
#   ./deploy.sh
#   ./deploy.sh --build-only
#   ./deploy.sh --skip-pm2
#
# Env: FRONTEND_PORT, NEXT_PUBLIC_BACKEND_URL (from .env.local)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
PM2_NAME="${PM2_NAME:-moviecontroller-frontend}"

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

fix_next_build_ownership() {
  local owner
  owner="$(deploy_owner)"
  if [ "$(id -un)" = "$owner" ]; then
    return 0
  fi
  step "Fix .next ownership for ${owner}"
  chown -R "${owner}:${owner}" "${SCRIPT_DIR}/.next"
}

BUILD_ONLY=0
SKIP_PM2=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --skip-pm2) SKIP_PM2=1 ;;
    -h|--help)
      echo "Usage: $0 [--build-only] [--skip-pm2]"
      echo "  Env: FRONTEND_PORT, NEXT_PUBLIC_BACKEND_URL"
      exit 0
      ;;
    *)
      err "Unknown option: ${arg}"
      exit 1
      ;;
  esac
done

START_TS=$(date +%s)
banner "Movie Controller frontend"

if ! command -v node &>/dev/null; then
  err "Node.js is not installed."
  exit 1
fi
if ! command -v npm &>/dev/null; then
  err "npm is not installed."
  exit 1
fi

if [ ! -f ".env.local" ] && [ -f ".env.example" ]; then
  warn "Missing .env.local — copy from .env.example"
fi

source_env_file ".env"
source_env_file ".env.local"

export NODE_ENV=production
export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://192.168.0.53:5000}"

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

step "Starting PM2 (${PM2_NAME}) on 127.0.0.1:${FRONTEND_PORT}"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
pm2 start npm \
  --name "$PM2_NAME" \
  --cwd "$SCRIPT_DIR" \
  -- run start -- -p "${FRONTEND_PORT}" -H 127.0.0.1
pm2 save >/dev/null 2>&1 || true

sleep 2
if pm2 list 2>/dev/null | grep -q "${PM2_NAME}.*online"; then
  info "PM2 process online"
else
  err "PM2 process failed to start. Check: pm2 logs ${PM2_NAME}"
  exit 1
fi

ELAPSED=$(( $(date +%s) - START_TS ))
banner "Deploy summary (${ELAPSED}s)"
info "Frontend running on http://127.0.0.1:${FRONTEND_PORT}"
info "Backend API: ${NEXT_PUBLIC_BACKEND_URL}"

cat <<EOF

Useful commands:
  pm2 status
  pm2 logs ${PM2_NAME}
  pm2 restart ${PM2_NAME}
EOF
