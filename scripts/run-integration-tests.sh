#!/usr/bin/env sh
# Start ghostcrab-backend on a dedicated integration SQLite file, then run vitest integration.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKEND_BIN="${GHOSTCRAB_BACKEND_BIN:-$ROOT/cmd/backend/zig-out/bin/ghostcrab-backend}"
BACKEND_ADDR="${GHOSTCRAB_INTEGRATION_BACKEND_ADDR:-:18191}"
BACKEND_PORT="${BACKEND_ADDR#:}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"

IT_DIR="$(mktemp -d /tmp/ghostcrab-it-XXXXXX)"
IT_DB="$IT_DIR/integration.sqlite"
IT_LOG="$IT_DIR/backend.log"

export GHOSTCRAB_INTEGRATION_EXTERNALLY_MANAGED=1
export GHOSTCRAB_MINDBRAIN_URL="$BACKEND_URL"
export GHOSTCRAB_SQLITE_PATH="$IT_DB"
export GHOSTCRAB_MINDBRAIN_URL="$BACKEND_URL"
export GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS="${GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS:-30000}"
export GHOSTCRAB_EMBEDDINGS_MODE="${GHOSTCRAB_EMBEDDINGS_MODE:-disabled}"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  rm -rf "$IT_DIR"
}
trap cleanup EXIT

if [ ! -x "$BACKEND_BIN" ]; then
  echo "[integration] ERROR: backend binary not found: $BACKEND_BIN" >&2
  echo "  Build it: ZIG=zig-0.16 pnpm run backend:build" >&2
  exit 1
fi

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
  sleep 0.2
fi

echo "[integration] sqlite: $IT_DB"
echo "[integration] backend: $BACKEND_BIN ($BACKEND_URL)"

GHOSTCRAB_BACKEND_ADDR="$BACKEND_ADDR" \
GHOSTCRAB_SQLITE_PATH="$IT_DB" \
  "$BACKEND_BIN" >"$IT_LOG" 2>&1 &
BACKEND_PID=$!

echo "[integration] waiting for $BACKEND_URL/health ..."
ready=0
for _ in $(seq 1 50); do
  if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[integration] backend exited early:" >&2
    cat "$IT_LOG" >&2
    exit 1
  fi
  sleep 0.2
done

if [ "$ready" -ne 1 ]; then
  echo "[integration] backend did not become healthy" >&2
  cat "$IT_LOG" >&2
  exit 1
fi

echo "[integration] backend healthy (pid $BACKEND_PID)"
cd "$ROOT"
if [ "${1:-}" = "--" ]; then
  shift
fi
exec pnpm exec vitest run --config vitest.integration.config.ts "$@"
