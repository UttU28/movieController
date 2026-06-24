#!/usr/bin/env bash
# Movie Controller backend — FastAPI + uvicorn + PM2
#
#   ./deploy.sh              # preferred: run as your desktop user (ashwathama)
#   sudo ./deploy.sh         # OK: PM2 still runs as SUDO_USER, not root
#
# Env (from .env): HOST, PORT, RELOAD, CORS_ORIGINS, BACKEND_URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step()   { echo -e "${BLUE}[moviecontroller-api]${NC} $*"; }
info()   { echo -e "${GREEN}[moviecontroller-api]${NC} $*"; }
warn()   { echo -e "${YELLOW}[moviecontroller-api]${NC} $*" >&2; }
err()    { echo -e "${RED}[moviecontroller-api]${NC} $*" >&2; }
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

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"
DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" 2>/dev/null | cut -d: -f6 || echo "$HOME")"
DEPLOY_UID="$(id -u "$DEPLOY_USER" 2>/dev/null || id -u)"

resolve_xauthority() {
  if [ -n "${XAUTHORITY:-}" ] && [ ! -f "${XAUTHORITY}" ]; then
    warn "XAUTHORITY=${XAUTHORITY} not found — auto-detecting for ${DEPLOY_USER}"
    unset XAUTHORITY
  fi
  if [ -n "${XAUTHORITY:-}" ] && [ -f "${XAUTHORITY}" ]; then
    return 0
  fi
  local candidate
  for candidate in \
    "${DEPLOY_HOME}/.Xauthority" \
    "/run/user/${DEPLOY_UID}/gdm/Xauthority" \
    "/run/user/${DEPLOY_UID}/Xauthority"; do
    if [ -f "$candidate" ]; then
      export XAUTHORITY="$candidate"
      return 0
    fi
  done
  # Mutter/Wayland Xwayland auth cookie (Pi OS Bookworm+)
  for candidate in /run/user/"${DEPLOY_UID}"/.mutter-Xwaylandauth.*; do
    if [ -f "$candidate" ]; then
      export XAUTHORITY="$candidate"
      return 0
    fi
  done
  unset XAUTHORITY
  return 1
}

setup_session_env() {
  export DISPLAY="${DISPLAY:-:0}"
  export INPUT_BACKEND="${INPUT_BACKEND:-auto}"
  if ! resolve_xauthority; then
    warn "No .Xauthority found for ${DEPLOY_USER} — xdotool may fail."
    warn "Unset XAUTHORITY in .env or set: XAUTHORITY=${DEPLOY_HOME}/.Xauthority"
  else
    info "DISPLAY=${DISPLAY} XAUTHORITY=${XAUTHORITY}"
  fi
}

run_as_deploy_user() {
  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "$DEPLOY_USER" != "root" ]]; then
    sudo -u "$DEPLOY_USER" -H env \
      DISPLAY="${DISPLAY}" \
      XAUTHORITY="${XAUTHORITY:-}" \
      INPUT_BACKEND="${INPUT_BACKEND}" \
      HOME="${DEPLOY_HOME}" \
      bash -c "$*"
  else
    bash -c "$*"
  fi
}

pm2_cmd() {
  if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "$DEPLOY_USER" != "root" ]]; then
    sudo -u "$DEPLOY_USER" -H pm2 "$@"
  else
    pm2 "$@"
  fi
}

SKIP_PM2=0
for arg in "$@"; do
  case "$arg" in
    --skip-pm2) SKIP_PM2=1 ;;
    -h|--help)
      echo "Usage: $0 [--skip-pm2]"
      exit 0
      ;;
    *)
      err "Unknown option: ${arg}"
      exit 1
      ;;
  esac
done

START_TS=$(date +%s)
banner "Movie Controller API"

if [ ! -f ".example.env" ] && [ ! -f ".env" ]; then
  warn "No .env found — copy .example.env to .env and adjust values."
elif [ ! -f ".env" ]; then
  warn "Missing .env — copy from .example.env"
fi

source_env_file ".env"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5000}"
PM2_NAME="${PM2_NAME:-moviecontroller-backend}"

setup_session_env

if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "$DEPLOY_USER" != "root" ]]; then
  info "Deploy user: ${DEPLOY_USER} (PM2 + input control run as this user, not root)"
fi

if ! command -v python3 &>/dev/null; then
  err "python3 is not installed."
  exit 1
fi

if [ ! -f "requirements.txt" ]; then
  err "requirements.txt not found in ${SCRIPT_DIR}"
  exit 1
fi

step "Python virtual environment"
if [ ! -d "env" ]; then
  run_as_deploy_user "cd '${SCRIPT_DIR}' && python3 -m venv env"
fi
if [[ "$(id -u)" -eq 0 && -n "${SUDO_USER:-}" && "$DEPLOY_USER" != "root" ]]; then
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" env 2>/dev/null || true
fi

step "Installing dependencies"
run_as_deploy_user "cd '${SCRIPT_DIR}' && source env/bin/activate && pip install --upgrade pip >/dev/null && pip install -r requirements.txt"

step "Verifying imports"
run_as_deploy_user "cd '${SCRIPT_DIR}' && source env/bin/activate && python -c \"import fastapi, uvicorn, dotenv; from utils.input_control import diagnostics; print('ok')\""

if [ "$SKIP_PM2" -eq 1 ]; then
  ELAPSED=$(( $(date +%s) - START_TS ))
  banner "Deploy summary (${ELAPSED}s)"
  info "Dependencies ready (SKIP_PM2). Start manually:"
  info "  cd ${SCRIPT_DIR} && source env/bin/activate && uvicorn app:app --host ${HOST} --port ${PORT}"
  exit 0
fi

if ! command -v pm2 &>/dev/null; then
  err "PM2 is not installed. Install: npm install -g pm2"
  exit 1
fi

step "Freeing port ${PORT}"
for pid in $(lsof -t -i ":${PORT}" 2>/dev/null || true); do
  kill "${pid}" 2>/dev/null || true
done
sleep 1

step "Starting PM2 (${PM2_NAME}) as ${DEPLOY_USER}"
pm2_cmd delete "$PM2_NAME" >/dev/null 2>&1 || true
run_as_deploy_user "cd '${SCRIPT_DIR}' && HOST='${HOST}' PORT='${PORT}' PM2_NAME='${PM2_NAME}' DISPLAY='${DISPLAY}' XAUTHORITY='${XAUTHORITY:-}' INPUT_BACKEND='${INPUT_BACKEND}' pm2 start ecosystem.config.cjs"
pm2_cmd save >/dev/null 2>&1 || true

sleep 2
if pm2_cmd list 2>/dev/null | grep -q "${PM2_NAME}.*online"; then
  info "PM2 process online"
else
  err "PM2 process failed to start. Check: pm2 logs ${PM2_NAME}"
  exit 1
fi

ELAPSED=$(( $(date +%s) - START_TS ))
banner "Deploy summary (${ELAPSED}s)"
info "Backend running on http://${HOST}:${PORT}"
info "Docs: http://127.0.0.1:${PORT}/docs"
info "Public URL (from .env): ${BACKEND_URL:-http://127.0.0.1:${PORT}}"

cat <<EOF

Useful commands:
  pm2 status
  pm2 logs ${PM2_NAME}
  pm2 restart ${PM2_NAME}
EOF
