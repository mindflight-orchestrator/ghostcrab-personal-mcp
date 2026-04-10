# Building on macOS (Intel and Apple Silicon)

> **Note**: This file is kept for backward compatibility. The canonical macOS documentation is [README_MACOSX.md](../README_MACOSX.md) at the repository root.

This guide covers building `pg_facets` and `pg_dgraph` on macOS, including both Intel (x86_64) and Apple Silicon (M1/M2/M3) Macs.

## Prerequisites

- **PostgreSQL 17+** with development headers
- **Zig 0.15.2+**
- **Xcode Command Line Tools** (for `make`, `clang`)

### Installation (Homebrew)

```bash
# PostgreSQL 17
brew install postgresql@17

# Zig
brew install zig

# Xcode CLT (if not already installed)
xcode-select --install
```

Add PostgreSQL to your PATH:

```bash
echo 'export PATH="$(brew --prefix postgresql@17)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Quick Build

Use the provided script from the repository root:

```bash
./scripts/build-macos.sh
```

This script:
1. Verifies `pg_config` and `zig` are in PATH
2. Initializes git submodules
3. Builds `pg_roaringbitmap` (using the standard Makefile, **not** Makefile_native)
4. Builds `pg_facets` and `pg_dgraph` with Zig

## Cross-Compilation

From an Intel Mac, you can cross-compile the Zig extensions for Apple Silicon:

```bash
./scripts/build-macos.sh --target aarch64-macos
```

Note: `pg_roaringbitmap` is built with the system compiler, so it will always target your current architecture. Only the Zig extensions (`pg_facets`, `pg_dgraph`) are cross-compiled.

From an Apple Silicon Mac, to target Intel:

```bash
./scripts/build-macos.sh --target x86_64-macos
```

## Manual Build

### 1. Initialize submodules

```bash
git submodule update --init --recursive
```

### 2. Build pg_roaringbitmap

**Important**: On Apple Silicon, use `make` only. Do **not** use `make -f Makefile_native` — it enables `-mavx2` which is x86-only and will fail on M1.

```bash
# For pg_facets
cd extensions/pg_facets/deps/pg_roaringbitmap
make && make install
cd ../../..

# For pg_dgraph
cd extensions/pg_dgraph/deps/pg_roaringbitmap
make && make install
cd ../../..
```

### 3. Build Zig extensions

```bash
# pg_facets
cd extensions/pg_facets
zig build -Doptimize=ReleaseFast

# pg_dgraph
cd extensions/pg_dgraph
zig build -Doptimize=ReleaseFast
```

## Artifacts

- **Linux**: `zig-out/lib/libpg_facets.so`, `libpg_dgraph.so`
- **macOS**: `zig-out/lib/libpg_facets.dylib`, `libpg_dgraph.dylib`

Verify architecture:

```bash
file extensions/pg_facets/zig-out/lib/libpg_facets.*
# macOS M1: Mach-O 64-bit dynamically linked shared library arm64
# macOS Intel: Mach-O 64-bit dynamically linked shared library x86_64
```

## Installing into PostgreSQL

Copy the built libraries and extension files to your PostgreSQL installation:

```bash
PKGLIB=$(pg_config --pkglibdir)
SHAREDIR=$(pg_config --sharedir)/extension

# pg_facets
cp extensions/pg_facets/zig-out/lib/libpg_facets.* $PKGLIB/
cp extensions/pg_facets/pg_facets.control $SHAREDIR/
cp extensions/pg_facets/sql/pg_facets--*.sql $SHAREDIR/

# pg_dgraph
cp extensions/pg_dgraph/zig-out/lib/libpg_dgraph.* $PKGLIB/
cp extensions/pg_dgraph/pg_dgraph.control $SHAREDIR/
cp extensions/pg_dgraph/sql/pg_dgraph--*.sql $SHAREDIR/
```

Or use `zig build install` if your build.zig has install steps configured.

## Docker on M1

The Dockerfiles support multi-architecture builds. On Apple Silicon, Docker runs Linux ARM64 containers by default. The build uses `zig-aarch64-linux` and an explicit Linux GNU target (`-Dtarget=aarch64-linux-gnu`) for extension compilation.

```bash
cd extensions/pg_facets/docker
docker-compose build
```

## Troubleshooting

### pg_config not found

Ensure PostgreSQL is in your PATH:
```bash
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
```

### pgxs.mk: No such file or directory (libpq vs postgresql@17)

If `pg_config` points to **libpq** (client-only), PGXS is missing and the pg_roaringbitmap build fails. Use the full PostgreSQL server package:

```bash
brew install postgresql@17
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
./scripts/build-macos.sh
```

Ensure `which pg_config` shows the postgresql@17 path, not libpq.

### Headers not found

The build uses `pg_config --includedir-server` first. If that fails, fallbacks include Homebrew paths. Check that PostgreSQL dev headers are installed (Homebrew's `postgresql@17` includes them).

### Makefile_native on M1

If you see errors about `-mavx2` or `-march=native` when building pg_roaringbitmap, you are using the wrong Makefile. Use plain `make`, not `make -f Makefile_native`.
