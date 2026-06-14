#!/usr/bin/env bash
# Launch the Immeuble backend in standalone HTTP mode for live pipelines.
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
IMMEUBLE_ROOT="$REPO_ROOT/examples/immeuble"

BACKEND_BIN="${GHOSTCRAB_BACKEND_BIN:-$REPO_ROOT/cmd/backend/zig-out/bin/ghostcrab-backend}"
BACKEND_ADDR=":8091"
DB_PATH="$REPO_ROOT/data/immeuble-lab.sqlite"
WORKSPACE_NAME="immeuble"
LOG_FILE="$IMMEUBLE_ROOT/.tmp-immeuble-backend.log"
READY_TIMEOUT_SEC=20
WAIT_FOR_HEALTH=1
FOREGROUND=0
KILL_PORT=1

usage() {
  cat <<EOF
Usage: examples/immeuble/scripts/run-immeuble-backend.sh [options]

Run ghostcrab-backend in standalone HTTP mode with an Immeuble workspace context.

Options:
  --db <path>                 SQLite file to use (default: $DB_PATH)
  --backend-bin <path>        ghostcrab-backend binary path
  --backend-addr <:port>      listen address (default: :8091)
  --workspace-name <name>      value for GHOSTCRAB_WORKSPACE_NAME (default: immeuble)
  --log-file <path>           where backend logs are written
  --ready-timeout <sec>       health-check timeout (default: 20)
  --foreground                keep backend attached in the current shell
  --no-health-check           do not wait for /health
  --no-kill-port              do not free the listen port before start
  -h, --help                  show this help
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_PATH="${2:?--db requires a value}"
      shift 2
      ;;
    --backend-bin)
      BACKEND_BIN="${2:?--backend-bin requires a value}"
      shift 2
      ;;
    --backend-addr)
      BACKEND_ADDR="${2:?--backend-addr requires a value}"
      shift 2
      ;;
    --workspace-name)
      WORKSPACE_NAME="${2:?--workspace-name requires a value}"
      shift 2
      ;;
    --log-file)
      LOG_FILE="${2:?--log-file requires a value}"
      shift 2
      ;;
    --ready-timeout)
      READY_TIMEOUT_SEC="${2:?--ready-timeout requires a value}"
      shift 2
      ;;
    --no-health-check)
      WAIT_FOR_HEALTH=0
      shift
      ;;
    --foreground)
      FOREGROUND=1
      shift
      ;;
    --no-kill-port)
      KILL_PORT=0
      shift
      ;;
    *)
      echo "[immeuble-backend] unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -x "$BACKEND_BIN" ]]; then
  echo "[immeuble-backend] backend binary not found: $BACKEND_BIN" >&2
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"
mkdir -p "$(dirname "$LOG_FILE")"

BACKEND_PORT="${BACKEND_ADDR##*:}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"

if (( KILL_PORT == 1 )) && command -v fuser >/dev/null 2>&1; then
  fuser -k "${BACKEND_ADDR#:}/tcp" 2>/dev/null || true
  sleep 0.2
fi

run_backend() {
  env \
    GHOSTCRAB_BACKEND_ADDR="$BACKEND_ADDR" \
    GHOSTCRAB_SQLITE_PATH="$DB_PATH" \
    GHOSTCRAB_WORKSPACE_NAME="$WORKSPACE_NAME" \
    "$BACKEND_BIN"
}

if (( FOREGROUND == 1 )); then
  echo "[immeuble-backend] starting foreground: $BACKEND_BIN -- $BACKEND_ADDR (db=$DB_PATH)"
  if ! run_backend 2>&1 | tee "$LOG_FILE"; then
    echo "[immeuble-backend] backend exited with failure" >&2
    exit 1
  fi
  exit 0
fi

echo "[immeuble-backend] starting detached: $BACKEND_BIN -- $BACKEND_ADDR (db=$DB_PATH)"
run_backend >"$LOG_FILE" 2>&1 &
BACKEND_PID=$!

if [[ "$WAIT_FOR_HEALTH" -ne 0 ]]; then
  ready=0
  for attempt in $(seq 1 200); do
    if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo "[immeuble-backend] backend exited before health check" >&2
      cat "$LOG_FILE" >&2
      exit 1
    fi
    if (( READY_TIMEOUT_SEC > 0 )); then
      # Keep legacy 0.2s cadence and enforce timeout.
      sleep 0.2
      if (( attempt >= READY_TIMEOUT_SEC * 5 )); then
        break
      fi
    else
      sleep 0.2
    fi
  done

  if [[ "$ready" -ne 1 ]]; then
    echo "[immeuble-backend] backend did not become healthy at $BACKEND_URL after ${READY_TIMEOUT_SEC}s" >&2
    cat "$LOG_FILE" >&2
    exit 1
  fi
fi

echo "[immeuble-backend] started"
echo "[immeuble-backend] BACKEND_PID=$BACKEND_PID"
echo "[immeuble-backend] BACKEND_URL=$BACKEND_URL"
echo "[immeuble-backend] BACKEND_DB=$DB_PATH"
echo "[immeuble-backend] BACKEND_LOG=$LOG_FILE"
