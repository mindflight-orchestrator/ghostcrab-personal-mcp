#!/usr/bin/env bash
# Fetch PostgreSQL 17 headers into ext_pg17_src/
# Use for Zig extensions (pg_facets, pg_dgraph).
# pg_roaringbitmap still needs PGXS (full PG install or submodule) — see docs/VENDORED_PG17_PLAN.md
#
# Usage: ./scripts/fetch_pg17_headers.sh [version]
# Example: ./scripts/fetch_pg17_headers.sh 17.2

set -e

PG_VER="${1:-17.2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

EXT_DIR="ext_pg17_src"
TARBALL="postgresql-${PG_VER}.tar.bz2"
URL="https://ftp.postgresql.org/pub/source/v${PG_VER}/${TARBALL}"

echo "Fetching PostgreSQL ${PG_VER} headers into ${EXT_DIR}/"
echo "URL: ${URL}"
echo ""

mkdir -p "$EXT_DIR"
cd /tmp
wget -q "$URL" 2>/dev/null || curl -sSL -O "$URL"
tar -xf "$TARBALL"
SRC="postgresql-${PG_VER}"

# Copy headers only (for Zig build; ~2MB)
rm -rf "$REPO_ROOT/${EXT_DIR}/include"
cp -r "$SRC/src/include" "$REPO_ROOT/${EXT_DIR}/include"

# Cleanup
rm -rf "$SRC" "$TARBALL"

cd "$REPO_ROOT"
echo ""
echo "Done. ${EXT_DIR}/include/ contains PostgreSQL 17 headers."
echo ""
echo "Note: pg_roaringbitmap requires PGXS (full PostgreSQL install or submodule)."
echo "These headers are used by pg_facets and pg_dgraph Zig builds."
echo "See docs/VENDORED_PG17_PLAN.md for full vendoring options."
