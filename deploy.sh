#!/usr/bin/env bash
# Movie Controller full-stack deploy — backend (FastAPI + PM2) + frontend (Next.js + PM2)
#
#   bash ~/Desktop/movieController/deploy.sh
#   bash ~/Desktop/movieController/deploy.sh --backend-only
#   bash ~/Desktop/movieController/deploy.sh --frontend-only
#   bash ~/Desktop/movieController/deploy.sh --build-only
#
# Optional env: DEPLOY_USER (when run with sudo for PM2 ownership)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="${ROOT}/backend"
FRONTEND="${ROOT}/frontend"
BACKEND_DEPLOY="${BACKEND}/deploy.sh"
FRONTEND_DEPLOY="${FRONTEND}/deploy.sh"

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step()   { echo -e "${BLUE}[moviecontroller]${NC} $*"; }
info()   { echo -e "${GREEN}[moviecontroller]${NC} $*"; }
warn()   { echo -e "${YELLOW}[moviecontroller]${NC} $*" >&2; }
err()    { echo -e "${RED}[moviecontroller]${NC} $*" >&2; }
banner() {
  echo ""
  echo -e "${CYAN}================================================================================${NC}"
  echo -e "${CYAN} $*${NC}"
  echo -e "${CYAN}================================================================================${NC}"
  echo ""
}

RUN_BACKEND=1
RUN_FRONTEND=1
BUILD_ONLY=0

usage() {
  cat <<'EOF'
Usage: deploy.sh [options]

Deploys Movie Controller backend (FastAPI + PM2) then frontend (Next.js + PM2).

Options:
  --backend-only   Deploy API only
  --frontend-only  Deploy Next.js app only
  --build-only     Frontend production build only (no PM2, no backend)
  -h, --help       Show this help

Examples:
  bash ~/Desktop/movieController/deploy.sh
  bash ~/Desktop/movieController/deploy.sh --backend-only
  bash ~/Desktop/movieController/deploy.sh --build-only
EOF
}

for arg in "$@"; do
  case "$arg" in
    --backend-only)
      RUN_BACKEND=1
      RUN_FRONTEND=0
      ;;
    --frontend-only)
      RUN_BACKEND=0
      RUN_FRONTEND=1
      ;;
    --build-only)
      BUILD_ONLY=1
      RUN_BACKEND=0
      RUN_FRONTEND=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "Unknown option: ${arg}"
      usage
      exit 1
      ;;
  esac
done

require_script() {
  local label="$1"
  local script="$2"
  if [[ ! -f "$script" ]]; then
    err "Missing ${label} deploy script: ${script}"
    exit 1
  fi
  chmod +x "$script"
}

run_as_deploy_user() {
  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "$DEPLOY_USER" != "root" ]]; then
    sudo -u "$DEPLOY_USER" -H bash -c "$*"
  else
    bash -c "$*"
  fi
}

deploy_backend() {
  banner "Movie Controller backend"
  require_script "backend" "$BACKEND_DEPLOY"
  step "Running ${BACKEND_DEPLOY}"
  bash "$BACKEND_DEPLOY"
  info "Backend deploy finished."
}

deploy_frontend() {
  banner "Movie Controller frontend"
  require_script "frontend" "$FRONTEND_DEPLOY"

  local args=()
  if [[ "$BUILD_ONLY" -eq 1 ]]; then
    args+=(--build-only)
  fi

  local frontend_cmd="cd '${FRONTEND}' && bash ./deploy.sh ${args[*]:-}"

  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" ]]; then
    step "Frontend deploy as ${DEPLOY_USER}"
    run_as_deploy_user "$frontend_cmd"
  else
    step "Running ${FRONTEND_DEPLOY} ${args[*]:-}"
    bash "$FRONTEND_DEPLOY" "${args[@]}"
  fi

  info "Frontend deploy finished."
}

START_TS=$(date +%s)
FAILED=()

banner "Movie Controller full-stack deploy"
info "Backend=${RUN_BACKEND} Frontend=${RUN_FRONTEND} buildOnly=${BUILD_ONLY}"
if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" ]]; then
  info "Running as root (PM2 user: ${DEPLOY_USER})"
fi

if [[ "$RUN_BACKEND" -eq 1 ]]; then
  deploy_backend || FAILED+=("backend")
fi

if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  deploy_frontend || FAILED+=("frontend")
fi

ELAPSED=$(( $(date +%s) - START_TS ))
banner "Deploy summary (${ELAPSED}s)"

if [[ "${#FAILED[@]}" -eq 0 ]]; then
  info "Movie Controller deployed successfully."
  cat <<'EOF'

Services:
  Backend:  http://192.168.0.53:5000  (see backend/.env)
  Frontend: http://127.0.0.1:3000     (see frontend/.env.local)

Useful commands:
  pm2 status
  pm2 logs moviecontroller-backend
  pm2 logs moviecontroller-frontend
EOF
else
  err "Failed: ${FAILED[*]}"
  exit 1
fi
