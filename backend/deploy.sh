#!/usr/bin/env bash
# Movie Controller backend — FastAPI + uvicorn + PM2
#
#   ./deploy.sh
#   ./deploy.sh --skip-pm2    # venv + deps only
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
PORT="${PORT:-9281}"
PM2_NAME="${PM2_NAME:-moviecontroller-backend}"

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
  python3 -m venv env
fi
# shellcheck disable=SC1091
source env/bin/activate

step "Installing dependencies"
pip install --upgrade pip >/dev/null
pip install -r requirements.txt

step "Verifying imports"
python -c "import fastapi, uvicorn, pyautogui, dotenv; print('ok')" >/dev/null

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

step "Starting PM2 (${PM2_NAME})"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
pm2 start env/bin/uvicorn \
  --name "$PM2_NAME" \
  --cwd "$SCRIPT_DIR" \
  --interpreter none \
  -- app:app --host "$HOST" --port "$PORT"
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
info "Backend running on http://${HOST}:${PORT}"
info "Docs: http://127.0.0.1:${PORT}/docs"
info "Public URL (from .env): ${BACKEND_URL:-http://127.0.0.1:${PORT}}"

cat <<EOF

Useful commands:
  pm2 status
  pm2 logs ${PM2_NAME}
  pm2 restart ${PM2_NAME}
EOF
