#!/usr/bin/env bash
# Install a built Zig extension next to PostgreSQL and verify CREATE EXTENSION.
# Requires: roaringbitmap already installed (e.g. from extensions/*/deps/pg_roaringbitmap).
#
# Usage:
#   ./scripts/smoke-create-extension.sh [pg_facets|pg_dgraph|pg_pragma]
# Default: pg_pragma
set -euo pipefail

EXT="${1:-pg_pragma}"
PKG="$(pg_config --pkglibdir)"
SHARE="$(pg_config --sharedir)/extension"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$EXT" in
  pg_facets)
    BUILD_DIR="${REPO_ROOT}/extensions/pg_facets/zig-out/lib"
    LIB_BASE="libpg_facets"
    CONTROL="${REPO_ROOT}/extensions/pg_facets/pg_facets.control"
    SQL_DIR="${REPO_ROOT}/extensions/pg_facets/sql"
    SQL_PREFIX="pg_facets--"
    ;;
  pg_dgraph)
    BUILD_DIR="${REPO_ROOT}/extensions/pg_dgraph/zig-out/lib"
    LIB_BASE="libpg_dgraph"
    CONTROL="${REPO_ROOT}/extensions/pg_dgraph/pg_dgraph.control"
    SQL_DIR="${REPO_ROOT}/extensions/pg_dgraph/sql"
    SQL_PREFIX="pg_dgraph--"
    ;;
  pg_pragma)
    BUILD_DIR="${REPO_ROOT}/extensions/pg_pragma/zig-out/lib"
    LIB_BASE="libpg_pragma"
    CONTROL="${REPO_ROOT}/extensions/pg_pragma/pg_pragma.control"
    SQL_DIR="${REPO_ROOT}/extensions/pg_pragma/sql"
    SQL_PREFIX="pg_pragma--"
    ;;
  *)
    echo "Unknown extension: $EXT (expected pg_facets, pg_dgraph, or pg_pragma)" >&2
    exit 1
    ;;
esac

shopt -s nullglob
SO_FILES=("${BUILD_DIR}/${LIB_BASE}".so "${BUILD_DIR}/${LIB_BASE}".dylib)
if [[ ${#SO_FILES[@]} -eq 0 ]]; then
  echo "No ${LIB_BASE}.so or ${LIB_BASE}.dylib under ${BUILD_DIR}" >&2
  exit 1
fi
SO_FILE="${SO_FILES[0]}"
LIB_INSTALL_NAME="$(basename "${SO_FILE}")"

sudo cp "${SO_FILE}" "${PKG}/${LIB_INSTALL_NAME}"
sudo ln -sf "${LIB_INSTALL_NAME}" "${PKG}/${EXT}.so"
sudo cp "${CONTROL}" "${SHARE}/"
sudo cp "${SQL_DIR}/${SQL_PREFIX}"*.sql "${SHARE}/"
shopt -u nullglob

sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS roaringbitmap;"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "DROP EXTENSION IF EXISTS ${EXT};"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE EXTENSION ${EXT};"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "SELECT extname FROM pg_extension WHERE extname = '${EXT}';"
