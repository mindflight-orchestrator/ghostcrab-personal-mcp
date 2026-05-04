#!/usr/bin/env sh
# Smoke-test the ghostcrab-backend + MCP server handshake.
# Usage: scripts/smoke-backend.sh [backend-binary-path]
#
# Exits 0 if all checks pass, 1 on failure.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BACKEND_BIN="${1:-"$ROOT/cmd/backend/zig-out/bin/ghostcrab-backend"}"
BACKEND_ADDR="${GHOSTCRAB_BACKEND_ADDR:-:18099}"
SQLITE_PATH="${GHOSTCRAB_SQLITE_PATH:-"/tmp/ghostcrab-smoke-$$.sqlite"}"
BACKEND_URL="http://127.0.0.1${BACKEND_ADDR}"

if [ ! -x "$BACKEND_BIN" ]; then
    echo "[smoke] ERROR: backend binary not found: $BACKEND_BIN" >&2
    echo "  Build it first:  make backend-build" >&2
    exit 1
fi

cleanup() {
    if [ -n "${BACKEND_PID:-}" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    rm -f "$SQLITE_PATH" "${SQLITE_PATH}-shm" "${SQLITE_PATH}-wal"
}
trap cleanup EXIT

# Start the backend
GHOSTCRAB_BACKEND_ADDR="$BACKEND_ADDR" \
GHOSTCRAB_SQLITE_PATH="$SQLITE_PATH" \
    "$BACKEND_BIN" >"$ROOT/.smoke-backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for it to become healthy
echo "[smoke] waiting for backend at $BACKEND_URL/health ..."
for i in $(seq 1 20); do
    if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[smoke] backend exited early:" >&2
        cat "$ROOT/.smoke-backend.log" >&2
        exit 1
    fi
    sleep 0.2
done

if ! curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo "[smoke] ERROR: backend did not become healthy after 4s" >&2
    cat "$ROOT/.smoke-backend.log" >&2
    exit 1
fi

echo "[smoke] ✓ GET /health"

# Test autocommit SQL
result=$(curl -sf -X POST "$BACKEND_URL/api/mindbrain/sql" \
    -H 'content-type: application/json' \
    -d '{"sql":"SELECT 42 AS answer","params":[]}')
echo "[smoke] ✓ POST /api/mindbrain/sql → $result"

expected='"answer"'
if ! printf '%s' "$result" | grep -q "$expected"; then
    echo "[smoke] ERROR: unexpected SQL response" >&2
    exit 1
fi

# Test session open/query/close
session_result=$(curl -sf -X POST "$BACKEND_URL/api/mindbrain/sql/session/open" \
    -H 'content-type: application/json' \
    -d '{}')
echo "[smoke] ✓ POST /api/mindbrain/sql/session/open → $session_result"

session_id=$(printf '%s' "$session_result" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
echo "[smoke]   session_id=$session_id"

query_result=$(curl -sf -X POST "$BACKEND_URL/api/mindbrain/sql/session/query" \
    -H 'content-type: application/json' \
    -d "{\"session_id\":$session_id,\"sql\":\"SELECT 'hello' AS msg\",\"params\":[]}")
echo "[smoke] ✓ POST /api/mindbrain/sql/session/query → $query_result"

close_result=$(curl -sf -X POST "$BACKEND_URL/api/mindbrain/sql/session/close" \
    -H 'content-type: application/json' \
    -d "{\"session_id\":$session_id,\"commit\":true}")
echo "[smoke] ✓ POST /api/mindbrain/sql/session/close → $close_result"

# Traverse (should return empty, not crash)
traverse_result=$(curl -sf "$BACKEND_URL/api/mindbrain/traverse?start=agent:self&direction=outbound&depth=1")
echo "[smoke] ✓ GET /api/mindbrain/traverse → $traverse_result"

echo ""
echo "[smoke] all checks passed."
rm -f "$ROOT/.smoke-backend.log"
