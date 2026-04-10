#!/usr/bin/env bash
# Add PostgreSQL 17 as submodule for self-contained builds (Option A)
# Run from repository root. Requires network.
#
# Usage: ./scripts/setup_pg17_submodule.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "ext_pg17_src/configure" ]]; then
  echo "ext_pg17_src already initialized."
  cd ext_pg17_src
  git fetch origin tag REL_17_2 --no-tags 2>/dev/null || true
  git checkout REL_17_2
  cd ..
  echo "Checked out REL_17_2."
  exit 0
fi

echo "Adding PostgreSQL 17 as submodule..."
git submodule add https://github.com/postgres/postgres.git ext_pg17_src

cd ext_pg17_src
git fetch origin tag REL_17_2 2>/dev/null || git fetch origin
git checkout REL_17_2 2>/dev/null || git checkout REL_17_STABLE
cd ..

echo ""
echo "Done. ext_pg17_src/ contains PostgreSQL 17 source."
echo "Build with: PG_VENDORED=1 ./scripts/build-macos.sh"
echo "Or: docker-compose build (Dockerfiles use vendored PG when present)"
