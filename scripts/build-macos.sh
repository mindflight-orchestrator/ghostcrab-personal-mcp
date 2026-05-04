#!/usr/bin/env bash
# Build pg_facets and pg_dgraph on macOS (Intel and Apple Silicon)
#
# Prerequisites:
#   - PostgreSQL 17+ with dev headers (brew install postgresql@17)
#   - Zig 0.15.x (brew install zig or download from ziglang.org)
#   - Xcode Command Line Tools (xcode-select --install)
#
# Usage:
#   ./scripts/build-macos.sh                    # Native build for current architecture
#   ./scripts/build-macos.sh --target aarch64-macos   # Cross-compile to M1 from Intel
#   ./scripts/build-macos.sh --target x86_64-macos     # Cross-compile to Intel from M1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ZIG_TARGET=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --target)
      ZIG_TARGET="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------------
# 0. Check for vendored PostgreSQL (ext_pg17_src submodule)
# -----------------------------------------------------------------------------
USE_VENDORED=""
if [[ -d "ext_pg17_src" ]] && [[ -f "ext_pg17_src/configure" ]]; then
  USE_VENDORED=1
  echo -e "${GREEN}Using vendored PostgreSQL (ext_pg17_src)${NC}"
fi

# -----------------------------------------------------------------------------
# 1. Verify prerequisites
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Checking prerequisites...${NC}"

if [[ -z "$USE_VENDORED" ]] && ! command -v pg_config &>/dev/null; then
  echo -e "${RED}ERROR: pg_config not found. Install PostgreSQL dev packages:${NC}"
  echo "  brew install postgresql@17"
  exit 1
fi

if [[ -n "$USE_VENDORED" ]]; then
  PG_VERSION=17
else
  PG_VERSION=$(pg_config --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
fi
if [[ -z "$PG_VERSION" ]] || [[ "$PG_VERSION" -lt 16 ]]; then
  echo -e "${RED}ERROR: PostgreSQL 16+ required (found: $(pg_config --version 2>/dev/null || echo 'unknown'))${NC}"
  echo "  Ensure Postgres.app is in PATH: export PATH=\"/Applications/Postgres.app/Contents/Versions/latest/bin:\$PATH\""
  exit 1
fi

# PGXS is required for pg_roaringbitmap
# pg_config --pgxs may return the path to the .mk file or to the pgxs directory
PGXS_PATH=$(pg_config --pgxs 2>/dev/null)
if [[ -z "$PGXS_PATH" ]]; then
  PGXS_MK=""
elif [[ -f "$PGXS_PATH" ]]; then
  PGXS_MK="$PGXS_PATH"
elif [[ -f "${PGXS_PATH}/src/makefiles/pgxs.mk" ]]; then
  PGXS_MK="${PGXS_PATH}/src/makefiles/pgxs.mk"
else
  # Try Postgres.app structure: share/postgresql/pgxs
  PGXS_MK=""
  PG_BINDIR=$(dirname "$(command -v pg_config)")
  PG_BASE=$(dirname "$(dirname "$PG_BINDIR")")
  for candidate in \
    "${PG_BASE}/share/postgresql/pgxs/src/makefiles/pgxs.mk" \
    "${PG_BASE}/share/postgresql/extension/pgxs/src/makefiles/pgxs.mk" \
    "${PG_BASE}/lib/postgresql/pgxs/src/makefiles/pgxs.mk"; do
    if [[ -f "$candidate" ]]; then
      PGXS_MK="$candidate"
      break
    fi
  done
  if [[ -z "$PGXS_MK" ]] && [[ -d "$PG_BASE/share" ]]; then
    FOUND=$(find "$PG_BASE/share" -name "pgxs.mk" 2>/dev/null | head -1)
    [[ -n "$FOUND" ]] && PGXS_MK="$FOUND"
  fi
fi
if [[ -z "$PGXS_MK" ]] || [[ ! -f "$PGXS_MK" ]]; then
  echo -e "${RED}ERROR: PGXS not found (pg_config --pgxs: '$PGXS_PATH')${NC}"
  echo "  pg_roaringbitmap needs the PostgreSQL extension build system (PGXS)."
  echo ""
  echo "  See README_MACOSX.md for full macOS build instructions."
  echo "  Postgres.app: Some versions may not include PGXS. Try:"
  echo "    - Re-download Postgres.app (ensure it includes extension development files)"
  echo "    - Or use Docker: cd extensions/pg_facets/docker && docker-compose build"
  echo ""
  echo "  Homebrew (if available):"
  echo "    brew install postgresql@17"
  echo "    export PATH=\"\$(brew --prefix postgresql@17)/bin:\$PATH\""
  exit 1
fi

if ! command -v zig &>/dev/null; then
  echo -e "${RED}ERROR: zig not found. Install Zig:${NC}"
  echo "  brew install zig"
  echo "  or download from https://ziglang.org/download/"
  exit 1
fi

ZIG_VER=$(zig version 2>/dev/null | cut -d. -f1,2)
echo -e "${GREEN}Found: PostgreSQL $PG_VERSION, Zig $ZIG_VER${NC}"

# -----------------------------------------------------------------------------
# 2. Vendored: build PostgreSQL from source, or init submodules
# -----------------------------------------------------------------------------
echo ""
if [[ -n "$USE_VENDORED" ]]; then
  echo -e "${YELLOW}Building PostgreSQL from ext_pg17_src...${NC}"
  PG_INSTALL="$REPO_ROOT/.pg_install"
  mkdir -p "$PG_INSTALL"
  (cd ext_pg17_src && ./configure --prefix="$PG_INSTALL" --without-icu && make -j$(sysctl -n hw.ncpu 2>/dev/null || echo 4) && make install)
  export PATH="$PG_INSTALL/bin:$PATH"
  PGXS_MK="$PG_INSTALL/lib/postgresql/pgxs/src/makefiles/pgxs.mk"
  [[ ! -f "$PGXS_MK" ]] && PGXS_MK="$PG_INSTALL/lib/pgxs/src/makefiles/pgxs.mk"
  [[ ! -f "$PGXS_MK" ]] && PGXS_MK=$(find "$PG_INSTALL" -name "pgxs.mk" 2>/dev/null | head -1)
  echo -e "${GREEN}PostgreSQL built and installed to $PG_INSTALL${NC}"
else
  echo -e "${YELLOW}Initializing submodules...${NC}"
  git submodule update --init --recursive
fi

# Ensure pg_roaringbitmap exists in both
for ext in pg_facets pg_dgraph; do
  RB_DIR="extensions/$ext/deps/pg_roaringbitmap"
  if [[ ! -d "$RB_DIR" ]]; then
    echo -e "${RED}ERROR: $RB_DIR not found. Run: git submodule update --init --recursive${NC}"
    exit 1
  fi
done

# -----------------------------------------------------------------------------
# 3. Build pg_roaringbitmap (standard Makefile - portable C, works on M1)
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Building pg_roaringbitmap...${NC}"

for ext in pg_facets pg_dgraph; do
  RB_DIR="extensions/$ext/deps/pg_roaringbitmap"
  echo "  Building in $RB_DIR"
  (cd "$RB_DIR" && make clean 2>/dev/null || true)
  # Pass PGXS explicitly in case pg_config --pgxs returns a non-standard path (e.g. Postgres.app)
  (cd "$RB_DIR" && make PGXS="$PGXS_MK")
  (cd "$RB_DIR" && make PGXS="$PGXS_MK" install)
done

echo -e "${GREEN}pg_roaringbitmap built and installed${NC}"

# -----------------------------------------------------------------------------
# 4. Build pg_facets and pg_dgraph
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Building Zig extensions...${NC}"

ZIG_EXTRA=""
if [[ -n "$ZIG_TARGET" ]]; then
  ZIG_EXTRA="-Dtarget=$ZIG_TARGET"
  echo "  Cross-compiling to target: $ZIG_TARGET"
fi

for ext in pg_facets pg_dgraph; do
  EXT_DIR="extensions/$ext"
  echo ""
  echo -e "${YELLOW}Building $ext...${NC}"
  (cd "$EXT_DIR" && zig build -Doptimize=ReleaseFast $ZIG_EXTRA)
  # Zig produces .so on Linux, .dylib on macOS
  for lib in "$EXT_DIR/zig-out/lib"/lib${ext}.so "$EXT_DIR/zig-out/lib"/lib${ext}.dylib; do
    if [[ -f "$lib" ]]; then
      echo -e "${GREEN}  $ext: $(file "$lib" | sed 's/.*: //')${NC}"
      break
    fi
  done
done

# -----------------------------------------------------------------------------
# 5. Summary
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Artifacts:"
echo "  - extensions/pg_facets/zig-out/lib/libpg_facets.so (or .dylib on macOS)"
echo "  - extensions/pg_dgraph/zig-out/lib/libpg_dgraph.so (or .dylib on macOS)"
echo ""
echo "To install into PostgreSQL (adjust paths for your setup):"
echo "  cp extensions/pg_facets/zig-out/lib/libpg_facets.* \$(pg_config --pkglibdir)/"
echo "  cp extensions/pg_dgraph/zig-out/lib/libpg_dgraph.* \$(pg_config --pkglibdir)/"
echo ""
