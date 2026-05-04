#!/usr/bin/env sh
# Cross-compile the Zig backend for all npm distribution targets.
# Outputs binaries into prebuilds/{platform-arch}/.
# Run from the repository root. Requires Zig 0.16 and the sqlite3 amalgamation.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "${ZIG:-}" ]; then
    ZIG_BIN="$ZIG"
elif command -v zig-0.16 >/dev/null 2>&1; then
    ZIG_BIN="$(command -v zig-0.16)"
else
    ZIG_BIN="zig"
fi
ZIG_OPTIMIZE="${ZIG_OPTIMIZE:-ReleaseFast}"
ZIG_CACHE="$ROOT/cmd/backend/.zig-cache-cross"
ZIG_LOCAL_CACHE_DIR="${ZIG_LOCAL_CACHE_DIR:-/tmp/ghostcrab-zig-local-cache}"
ZIG_GLOBAL_CACHE_DIR="${ZIG_GLOBAL_CACHE_DIR:-$ZIG_CACHE/global}"
export ZIG_LOCAL_CACHE_DIR ZIG_GLOBAL_CACHE_DIR

if ! "$ZIG_BIN" version >/dev/null 2>&1; then
    echo "[cross] Zig binary not executable: $ZIG_BIN" >&2
    exit 1
fi

ZIG_VERSION="$("$ZIG_BIN" version)"
case "$ZIG_VERSION" in
    0.16.*) ;;
    *)
        echo "[cross] Zig 0.16.x required, found $ZIG_VERSION at $ZIG_BIN" >&2
        echo "[cross] Set ZIG=/path/to/zig-0.16 or install zig-0.16 on PATH." >&2
        exit 1
        ;;
esac

build_one() {
    local zig_triple="$1"
    local npm_platform="$2"
    local binary_name="$3"   # ghostcrab-backend or ghostcrab-backend.exe

    echo "[cross] $zig_triple → prebuilds/$npm_platform/$binary_name"
    mkdir -p "prebuilds/$npm_platform"

    # Build into a temporary zig-out per target to avoid collisions.
    local out_dir="$ROOT/cmd/backend/zig-out-$npm_platform"
    (cd "$ROOT/cmd/backend" && "$ZIG_BIN" build \
        -Doptimize="$ZIG_OPTIMIZE" \
        -Dtarget="$zig_triple" \
        --prefix "$out_dir" \
        --global-cache-dir "$ZIG_CACHE")

    local target_path="prebuilds/$npm_platform/$binary_name"
    local temp_target="${target_path}.tmp"
    cp "$out_dir/bin/$binary_name" "$temp_target"
    chmod +x "$temp_target" 2>/dev/null || true
    mv -f "$temp_target" "$target_path"
    rm -rf "$out_dir"
    echo "[cross] ✓ prebuilds/$npm_platform/$binary_name"
}

build_document_one() {
    local zig_triple="$1"
    local npm_platform="$2"
    local binary_name="$3"   # ghostcrab-document or ghostcrab-document.exe

    echo "[cross] $zig_triple → prebuilds/$npm_platform/$binary_name (document CLI)"
    mkdir -p "prebuilds/$npm_platform"

    local out_dir="$ROOT/cmd/backend/zig-out-doc-$npm_platform"
    (cd "$ROOT/cmd/backend" && "$ZIG_BIN" build document-tool \
        -Doptimize="$ZIG_OPTIMIZE" \
        -Dtarget="$zig_triple" \
        --prefix "$out_dir" \
        --global-cache-dir "$ZIG_CACHE")

    local target_path="prebuilds/$npm_platform/$binary_name"
    local temp_target="${target_path}.tmp"
    cp "$out_dir/bin/$binary_name" "$temp_target"
    chmod +x "$temp_target" 2>/dev/null || true
    mv -f "$temp_target" "$target_path"
    rm -rf "$out_dir"
    echo "[cross] ✓ prebuilds/$npm_platform/$binary_name"
}

build_one "x86_64-linux-gnu"   "linux-x64"   "ghostcrab-backend"
build_document_one "x86_64-linux-gnu"   "linux-x64"   "ghostcrab-document"
build_one "aarch64-linux-gnu"  "linux-arm64"  "ghostcrab-backend"
build_document_one "aarch64-linux-gnu"  "linux-arm64"  "ghostcrab-document"
build_one "x86_64-macos"       "darwin-x64"   "ghostcrab-backend"
build_document_one "x86_64-macos"       "darwin-x64"   "ghostcrab-document"
build_one "aarch64-macos"      "darwin-arm64"  "ghostcrab-backend"
build_document_one "aarch64-macos"      "darwin-arm64"  "ghostcrab-document"
build_one "x86_64-windows-gnu" "win32-x64"    "ghostcrab-backend.exe"
build_document_one "x86_64-windows-gnu" "win32-x64"    "ghostcrab-document.exe"

echo "[cross] all platforms built."
