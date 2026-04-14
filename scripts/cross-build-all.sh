#!/usr/bin/env sh
# Cross-compile the Zig backend for all npm distribution targets.
# Outputs binaries into prebuilds/{platform-arch}/.
# Run from the repository root. Requires Zig ≥ 0.15 and the sqlite3 amalgamation.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

ZIG_OPTIMIZE="${ZIG_OPTIMIZE:-ReleaseFast}"
ZIG_CACHE="$ROOT/cmd/backend/.zig-cache-cross"

build_one() {
    local zig_triple="$1"
    local npm_platform="$2"
    local binary_name="$3"   # ghostcrab-backend or ghostcrab-backend.exe

    echo "[cross] $zig_triple → prebuilds/$npm_platform/$binary_name"
    mkdir -p "prebuilds/$npm_platform"

    # Build into a temporary zig-out per target to avoid collisions.
    local out_dir="$ROOT/cmd/backend/zig-out-$npm_platform"
    (cd "$ROOT/cmd/backend" && zig build \
        -Doptimize="$ZIG_OPTIMIZE" \
        -Dtarget="$zig_triple" \
        --prefix "$out_dir" \
        --global-cache-dir "$ZIG_CACHE")

    cp "$out_dir/bin/$binary_name" "prebuilds/$npm_platform/$binary_name"
    rm -rf "$out_dir"
    echo "[cross] ✓ prebuilds/$npm_platform/$binary_name"
}

build_one "x86_64-linux-gnu"   "linux-x64"   "ghostcrab-backend"
build_one "aarch64-linux-gnu"  "linux-arm64"  "ghostcrab-backend"
build_one "x86_64-macos"       "darwin-x64"   "ghostcrab-backend"
build_one "aarch64-macos"      "darwin-arm64"  "ghostcrab-backend"
build_one "x86_64-windows-gnu" "win32-x64"    "ghostcrab-backend.exe"

echo "[cross] all platforms built."
