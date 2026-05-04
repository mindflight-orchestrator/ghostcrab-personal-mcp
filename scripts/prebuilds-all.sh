#!/usr/bin/env sh
# Cross-compile the native backend for all npm prebuild targets (mirrors `make prebuilds`).
# Respects ZIG=/path/to/zig, same as scripts/cross-build-all.sh.
# Set BACKEND_VENDOR_UPDATE=0 in ensure-vendor to skip git pull (offline / CI).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/ensure-vendor.sh"
"$ROOT/scripts/download-sqlite3.sh"
"$ROOT/scripts/cross-build-all.sh"
