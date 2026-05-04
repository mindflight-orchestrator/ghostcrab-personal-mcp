#!/usr/bin/env sh
# Full native backend build: refresh vendor (mindbrain + ztoon), sqlite3, clean Zig output, then compile.
# Set BACKEND_VENDOR_UPDATE=0 to skip git fetch/pull in ensure-vendor (offline / CI pin).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
ZIG_BIN="${ZIG:-zig}"
ZIG_LOCAL_CACHE_DIR="${ZIG_LOCAL_CACHE_DIR:-/tmp/ghostcrab-zig-local-cache}"
ZIG_GLOBAL_CACHE_DIR="${ZIG_GLOBAL_CACHE_DIR:-/tmp/ghostcrab-zig-global-cache}"
export ZIG_LOCAL_CACHE_DIR ZIG_GLOBAL_CACHE_DIR

"$ROOT/scripts/ensure-vendor.sh"
"$ROOT/scripts/download-sqlite3.sh"

if [ -d "$ROOT/cmd/backend/zig-out" ]; then
  echo "[backend] cleaning cmd/backend/zig-out" >&2
  rm -rf "$ROOT/cmd/backend/zig-out"
fi
if [ -d "$ROOT/cmd/backend/.zig-cache" ]; then
  echo "[backend] cleaning cmd/backend/.zig-cache" >&2
  rm -rf "$ROOT/cmd/backend/.zig-cache"
fi

cd "$ROOT/cmd/backend"
exec "$ZIG_BIN" build -Doptimize=ReleaseFast
