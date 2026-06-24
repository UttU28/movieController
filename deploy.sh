#!/usr/bin/env bash
# Movie Controller deploy — backend (FastAPI + PM2) + frontend (Next.js + PM2 + nginx)
#
#   sudo bash ~/Desktop/movieController/deploy.sh           # interactive menu (default: all)
#   sudo bash ~/Desktop/movieController/deploy.sh 0         # all
#   sudo bash ~/Desktop/movieController/deploy.sh 1         # frontend only (+ nginx/domain)
#   sudo bash ~/Desktop/movieController/deploy.sh 2         # backend only
#
#   0 = all   1 = frontend   2 = backend
#
# Optional env: DEPLOY_USER, CERTBOT_EMAIL, FRONTEND_DOMAIN
#
#   https://control.thatinsaneguy.com  → frontend only (Next.js :9280)
#   http://192.168.0.53:9281           → backend API (no public domain)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="${ROOT}/backend"
FRONTEND="${ROOT}/frontend"
BACKEND_DEPLOY="${BACKEND}/deploy.sh"
FRONTEND_DEPLOY="${FRONTEND}/deploy.sh"

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-control.thatinsaneguy.com}"

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
SKIP_NGINX=0

usage() {
  cat <<'EOF'
Usage: deploy.sh [selection] [options]

Selection (prompts interactively when omitted):
  0       Backend + frontend (nginx/HTTPS on control.thatinsaneguy.com for frontend only)
  1       Frontend only (+ nginx/domain)
  2       Backend only (no nginx, no domain)

Options:
  --build-only     Frontend production build only (no PM2, no nginx, no backend)
  --skip-nginx     Skip nginx/certbot on frontend
  -h, --help       Show this help

Examples:
  sudo bash ~/Desktop/movieController/deploy.sh
  sudo bash ~/Desktop/movieController/deploy.sh 0
  sudo bash ~/Desktop/movieController/deploy.sh 1
  sudo bash ~/Desktop/movieController/deploy.sh 2
  CERTBOT_EMAIL=you@example.com sudo bash ~/Desktop/movieController/deploy.sh 1
EOF
}

is_numeric_selection() {
  local raw="${1//[[:space:]]/}"
  [[ "$raw" =~ ^[0-2]$ ]]
}

show_selection_menu() {
  echo ""
  echo -e "${CYAN}Select what to deploy${NC}"
  echo "  0 — Backend + frontend (nginx on ${FRONTEND_DOMAIN})"
  echo "  1 — Frontend only (nginx on ${FRONTEND_DOMAIN})"
  echo "  2 — Backend only (local API, no domain)"
  echo ""
  echo "Examples: 0   1   2"
  echo ""
  echo "Optional env: CERTBOT_EMAIL=you@example.com"
  echo ""
}

parse_selection() {
  case "${1//[[:space:]]/}" in
    0)
      RUN_BACKEND=1
      RUN_FRONTEND=1
      ;;
    1)
      RUN_BACKEND=0
      RUN_FRONTEND=1
      ;;
    2)
      RUN_BACKEND=1
      RUN_FRONTEND=0
      ;;
    *)
      err "Invalid selection: $1 (use 0, 1, or 2)"
      exit 1
      ;;
  esac
}

prompt_selection() {
  show_selection_menu
  local choice
  read -r -p "Enter choice [0]: " choice
  choice="${choice:-0}"
  parse_selection "$choice"
}

parse_args() {
  local saw_selection=0
  local positional=()

  for arg in "$@"; do
    case "$arg" in
      --backend-only)
        saw_selection=1
        RUN_BACKEND=1
        RUN_FRONTEND=0
        ;;
      --frontend-only)
        saw_selection=1
        RUN_BACKEND=0
        RUN_FRONTEND=1
        ;;
      --build-only)
        BUILD_ONLY=1
        RUN_BACKEND=0
        RUN_FRONTEND=1
        ;;
      --skip-nginx)
        SKIP_NGINX=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        if is_numeric_selection "$arg"; then
          if [[ "$saw_selection" -eq 1 ]]; then
            err "Use either a number (0/1/2) or --backend-only/--frontend-only, not both."
            exit 1
          fi
          saw_selection=1
          parse_selection "$arg"
        else
          positional+=("$arg")
        fi
        ;;
    esac
  done

  if [[ "${#positional[@]}" -gt 0 ]]; then
    err "Unknown argument(s): ${positional[*]}"
    usage
    exit 1
  fi

  if [[ "$saw_selection" -eq 0 ]]; then
    if [[ -t 0 ]]; then
      prompt_selection
    else
      parse_selection "0"
    fi
  fi
}

parse_args "$@"

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

  local user_args=()
  if [[ "$BUILD_ONLY" -eq 1 ]]; then
    user_args+=(--build-only)
  elif [[ "$SKIP_NGINX" -eq 1 ]]; then
    user_args+=(--skip-nginx)
  else
    user_args+=(--skip-nginx)
  fi

  local frontend_cmd="cd '${FRONTEND}' && bash ./deploy.sh ${user_args[*]:-}"
  local frontend_ok=0

  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" ]]; then
    step "Fix frontend tree ownership for ${DEPLOY_USER}"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" \
      "${FRONTEND}/node_modules" \
      "${FRONTEND}/.next" \
      "${FRONTEND}/package-lock.json" 2>/dev/null || true
    step "Frontend build + PM2 as ${DEPLOY_USER}"
    if run_as_deploy_user "$frontend_cmd"; then
      frontend_ok=1
    else
      err "Frontend build/PM2 failed — skipping nginx."
    fi
  else
    step "Running ${FRONTEND_DEPLOY} ${user_args[*]:-}"
    if bash "$FRONTEND_DEPLOY" "${user_args[@]}"; then
      frontend_ok=1
    else
      err "Frontend build/PM2 failed."
    fi
  fi

  if [[ "$frontend_ok" -eq 1 && "$BUILD_ONLY" -eq 0 && "$SKIP_NGINX" -eq 0 ]]; then
    if [[ "$(id -u)" -eq 0 ]]; then
      step "Nginx + SSL as root (frontend domain only)"
      bash "$FRONTEND_DEPLOY" --nginx-only
    else
      warn "Not root — nginx/certbot skipped. For full deploy: sudo bash ${ROOT}/deploy.sh 1"
    fi
  fi

  if [[ "$frontend_ok" -eq 0 ]]; then
    return 1
  fi

  info "Frontend deploy finished."
}

START_TS=$(date +%s)
FAILED=()

banner "Movie Controller deploy"
info "Backend=${RUN_BACKEND} Frontend=${RUN_FRONTEND} buildOnly=${BUILD_ONLY} skipNginx=${SKIP_NGINX}"
if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" ]]; then
  info "Running as root (PM2 user: ${DEPLOY_USER})"
elif [[ "$RUN_FRONTEND" -eq 1 && "$BUILD_ONLY" -eq 0 && "$SKIP_NGINX" -eq 0 ]]; then
  warn "Not root — nginx/certbot may be skipped. For full deploy: sudo bash ${ROOT}/deploy.sh 1"
fi

if [[ "$RUN_BACKEND" -eq 1 ]]; then
  if ! deploy_backend; then FAILED+=("backend"); fi
fi

if [[ "$RUN_FRONTEND" -eq 1 ]]; then
  if ! deploy_frontend; then FAILED+=("frontend"); fi
fi

ELAPSED=$(( $(date +%s) - START_TS ))
banner "Deploy summary (${ELAPSED}s)"

if [[ "${#FAILED[@]}" -eq 0 ]]; then
  info "Movie Controller deployed successfully."
  echo ""
  info "Services:"
  if [[ "$RUN_FRONTEND" -eq 1 ]]; then
    echo "  Frontend: https://${FRONTEND_DOMAIN}  (Next.js on 127.0.0.1:9280)"
  fi
  if [[ "$RUN_BACKEND" -eq 1 ]]; then
    echo "  Backend:  http://192.168.0.53:9281   (local API, no public domain)"
  fi
  cat <<'EOF'

Useful commands:
  pm2 status
  pm2 logs moviecontroller-backend
  pm2 logs moviecontroller-frontend
EOF
else
  err "Failed: ${FAILED[*]}"
  exit 1
fi
