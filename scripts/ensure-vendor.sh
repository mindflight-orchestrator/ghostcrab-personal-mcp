#!/usr/bin/env sh
# Ensure vendor/mindbrain and vendor/ztoon exist for the Zig backend build.
# Strategy:
#   1) git submodule update --init (if submodules are configured)
#   2) symlink sibling ../mindbrain if present
#   3) ztoon via vendor/mindbrain/deps/ztoon
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p "$ROOT/vendor"

if [ ! -f "$ROOT/vendor/mindbrain/build.zig" ]; then
    # 1. Try git submodule first
    if [ -f "$ROOT/.gitmodules" ] && grep -q mindbrain "$ROOT/.gitmodules" 2>/dev/null; then
        echo "[vendor] running git submodule update --init vendor/mindbrain" >&2
        git submodule update --init vendor/mindbrain
    # 2. Try sibling directory (local dev)
    elif [ -f "$ROOT/../mindbrain/build.zig" ]; then
        echo "[vendor] linking vendor/mindbrain -> ../../mindbrain (sibling)" >&2
        ln -sfn ../../mindbrain "$ROOT/vendor/mindbrain"
    # 3. Try git clone (CI — set MINDBRAIN_REPO_URL env var or falls back to default)
    elif command -v git >/dev/null 2>&1; then
        MINDBRAIN_REPO_URL="${MINDBRAIN_REPO_URL:-https://gitlab.com/webigniter/mindbrain.git}"
        echo "[vendor] cloning mindbrain from $MINDBRAIN_REPO_URL" >&2
        git clone --depth 1 "$MINDBRAIN_REPO_URL" "$ROOT/vendor/mindbrain"
    else
        echo "[vendor] ERROR: vendor/mindbrain not found and git is not available." >&2
        echo "  Option A: place the mindbrain repo as a sibling directory (../mindbrain)." >&2
        echo "  Option B: configure a git submodule:  git submodule add <url> vendor/mindbrain" >&2
        echo "  Option C: set MINDBRAIN_REPO_URL and ensure git is in PATH." >&2
        exit 1
    fi
fi

if [ ! -f "$ROOT/vendor/ztoon/src/lib.zig" ]; then
    if [ -f "$ROOT/vendor/mindbrain/deps/ztoon/src/lib.zig" ]; then
        echo "[vendor] linking vendor/ztoon -> vendor/mindbrain/deps/ztoon" >&2
        ln -sfn mindbrain/deps/ztoon "$ROOT/vendor/ztoon"
    else
        echo "[vendor] ERROR: vendor/ztoon not found and vendor/mindbrain/deps/ztoon is missing." >&2
        exit 1
    fi
fi

echo "[vendor] vendor/mindbrain and vendor/ztoon are ready." >&2
