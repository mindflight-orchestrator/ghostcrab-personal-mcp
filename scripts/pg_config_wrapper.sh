#!/usr/bin/env bash
# pg_config wrapper for vendored PostgreSQL (ext_pg17_src)
# Used when building with Option A (PostgreSQL submodule).
# Pass PG_INSTALL_DIR as env var (e.g. /tmp/pg_install).
#
# Usage: PG_INSTALL_DIR=/tmp/pg_install ./scripts/pg_config_wrapper.sh [options]

PG_ROOT="${PG_INSTALL_DIR:-/tmp/pg_install}"

case "${1:-}" in
  --version)
    echo "PostgreSQL 17.x (vendored)"
    ;;
  --includedir-server)
    echo "$PG_ROOT/include/server"
    ;;
  --includedir)
    echo "$PG_ROOT/include"
    ;;
  --pkglibdir)
    echo "$PG_ROOT/lib/postgresql"
    ;;
  --sharedir)
    echo "$PG_ROOT/share"
    ;;
  --bindir)
    echo "$PG_ROOT/bin"
    ;;
  --pgxs)
    echo "$PG_ROOT/lib/postgresql/pgxs"
    ;;
  --libdir)
    echo "$PG_ROOT/lib"
    ;;
  *)
    echo "Usage: $0 --version|--includedir-server|--includedir|--pkglibdir|--sharedir|--bindir|--pgxs|--libdir" >&2
    exit 1
    ;;
esac
