# Building on macOS (Intel & Apple Silicon)

This guide covers building `pg_facets` and `pg_dgraph` on macOS, for both **Intel (x86_64)** and **Apple Silicon (M1/M2/M3)** Macs.

## Platform Support

| Platform | Native Build | Docker |
|----------|--------------|--------|
| **Intel Mac (x86_64)** | Yes | Yes (linux/amd64) |
| **Apple Silicon (arm64)** | Yes | Yes (linux/arm64) |

All Docker containers in this repository support **multi-architecture builds**. On Intel Mac, Docker builds linux/amd64 images; on Apple Silicon, it builds linux/arm64 images. Dockerfiles keep `ZIG_VERSION=0.15.2`, detect runtime architecture via `uname -m`, and pass explicit Zig targets (`x86_64-linux-gnu` or `aarch64-linux-gnu`) for Linux extension builds.

---

## Prerequisites

- **PostgreSQL 17+** with development headers (Postgres.app or Homebrew)
- **Zig 0.15.2+** (`brew install zig` or [ziglang.org](https://ziglang.org/download/))
- **Xcode Command Line Tools** (`xcode-select --install`)

---

## Option 1: Postgres.app (Recommended)

Postgres.app is a pre-built PostgreSQL distribution. No compilation of PostgreSQL or its dependencies (e.g. gettext) is required.

1. **Download**: [postgresapp.com](https://postgresapp.com/)
2. **Install** and start PostgreSQL once
3. **Add to PATH**:
   ```bash
   export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
   ```
4. **Build**:
   ```bash
   ./scripts/build-macos.sh
   ```

### Postgres.app PGXS

Postgres.app installs PGXS at:
```
/Applications/Postgres.app/Contents/Versions/17/lib/postgresql/pgxs/src/makefiles/pgxs.mk
```

The build script automatically detects this path if `pg_config --pgxs` is non-standard.

---

## Option 2: Vendored PostgreSQL (Self-Contained)

No external PostgreSQL install. Builds from `ext_pg17_src` submodule.

```bash
# One-time setup (requires network)
./scripts/setup_pg17_submodule.sh

# Build (PostgreSQL compiled from source, then extensions)
./scripts/build-macos.sh
```

First run compiles PostgreSQL (~5–15 min). Output goes to `.pg_install/` (gitignored).

**Docker** (no apt, uses vendored source):
```bash
cd extensions/pg_facets/docker
docker-compose -f docker-compose.vendored.yml build
```

---

## Option 3: Homebrew

If Homebrew's PostgreSQL builds successfully on your macOS version:

```bash
brew install postgresql@17 zig
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
./scripts/build-macos.sh
```

**Note**: On older macOS (e.g. 13 Ventura) or Tier 2/3 configurations, Homebrew may fail to build `postgresql@17` due to dependency issues (e.g. gettext, json-c). Use Postgres.app or vendored (Option 2) in that case.

---

## Quick Build Script

From the repository root:

```bash
./scripts/build-macos.sh
```

The script:
1. Detects **vendored** (`ext_pg17_src`) or **installed** PostgreSQL (Postgres.app, Homebrew)
2. If vendored: builds PostgreSQL from source to `.pg_install/`, then extensions
3. If installed: verifies `pg_config` and PGXS, initializes submodules
4. Builds `pg_roaringbitmap` (standard Makefile — **never** `Makefile_native` on M1)
5. Builds `pg_facets` and `pg_dgraph` with Zig

---

## Cross-Compilation

### Intel Mac → Apple Silicon (for brother's M1)

```bash
./scripts/build-macos.sh --target aarch64-macos
```

Produces `arm64` binaries for the Zig extensions. Note: `pg_roaringbitmap` is built with the system compiler, so it targets the host architecture. For full M1 binaries, your brother can run the script on his M1 Mac.

### Apple Silicon Mac → Intel

```bash
./scripts/build-macos.sh --target x86_64-macos
```

---

## Docker on macOS

**Yes — all Docker containers work on both Intel and Apple Silicon Macs.**

The Dockerfiles select the correct Zig tarball and build target:
- **Intel Mac / linux/amd64**: `zig-x86_64-linux` + `-Dtarget=x86_64-linux-gnu`
- **Apple Silicon / linux/arm64**: `zig-aarch64-linux` + `-Dtarget=aarch64-linux-gnu`

Runtime architecture checks (`uname -m`) are used to reduce issues caused by `TARGETARCH` mismatches under emulation.

### Build and run

**Standard** (apt postgresql-server-dev):

```bash
cd extensions/pg_facets/docker
docker-compose build
docker-compose up -d
```

**Vendored** (no apt, uses `ext_pg17_src` submodule):

```bash
./scripts/setup_pg17_submodule.sh   # one-time, from repo root
cd extensions/pg_facets/docker
docker-compose -f docker-compose.vendored.yml build
docker-compose -f docker-compose.vendored.yml up -d
```

Same pattern for pg_dgraph. Base images provide both `linux/amd64` and `linux/arm64` variants.

---

## Manual Build

### 1. Initialize submodules

```bash
git submodule update --init --recursive
```

### 2. Build pg_roaringbitmap

**On Apple Silicon**: Use `make` only. Do **not** use `make -f Makefile_native` — it enables `-mavx2` (x86-only) and will fail.

```bash
cd extensions/pg_facets/deps/pg_roaringbitmap
make && make install
cd ../../..

cd extensions/pg_dgraph/deps/pg_roaringbitmap
make && make install
cd ../../..
```

### 3. Build Zig extensions

```bash
cd extensions/pg_facets
zig build -Doptimize=ReleaseFast

cd ../pg_dgraph
zig build -Doptimize=ReleaseFast
```

---

## Artifacts

| Platform | Extension files |
|----------|-----------------|
| Linux | `libpg_facets.so`, `libpg_dgraph.so` |
| macOS | `libpg_facets.dylib`, `libpg_dgraph.dylib` |

Verify architecture:
```bash
file extensions/pg_facets/zig-out/lib/libpg_facets.*
# M1: Mach-O 64-bit dynamically linked shared library arm64
# Intel: Mach-O 64-bit dynamically linked shared library x86_64
```

---

## Installing into PostgreSQL

```bash
cp extensions/pg_facets/zig-out/lib/libpg_facets.* $(pg_config --pkglibdir)/
cp extensions/pg_dgraph/zig-out/lib/libpg_dgraph.* $(pg_config --pkglibdir)/
# Copy control and SQL files if not already installed
```

---

## Troubleshooting

### pg_config not found

Add PostgreSQL to PATH:
```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
# or
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
```

### PostgreSQL 16+ required (found: unknown)

`pg_config` may be from **libpq** instead of full PostgreSQL. Ensure `which pg_config` points to Postgres.app or postgresql@17, not libpq.

### PGXS not found

The script searches for `pgxs.mk` in standard locations and Postgres.app’s layout. If you see this error:
- Ensure you use Postgres.app or `postgresql@17`, not libpq
- Or use Docker: `cd extensions/pg_facets/docker && docker-compose build`

### pgxs.mk: No such file (libpq vs postgresql)

**libpq** provides only the client library; it does **not** include PGXS. Use Postgres.app or `postgresql@17`.

### Headers not found

The Zig build uses `pg_config --includedir-server`. Fallbacks include Homebrew paths. Verify PostgreSQL dev headers are present.

### Makefile_native on M1

Errors about `-mavx2` or `-march=native` mean you used the wrong Makefile. Use `make`, not `make -f Makefile_native`.

### Vendored build: ext_pg17_src not found

Run `./scripts/setup_pg17_submodule.sh` first (requires network). Then `git submodule update --init ext_pg17_src` if cloning fresh.

---

## Docker on Apple Silicon (M1/M2/M3) — Full Test Suite

### No submodule required

Docker builds **clone pg_roaringbitmap during the build** — you do not need to run `git submodule update --init` for Docker. This applies to:

- `extensions/pg_facets/docker`
- `extensions/pg_dgraph/docker`
- Root `docker/` (combined pg_facets + pg_dgraph)

### Port conflicts

If port 5433 is already in use (e.g. another PostgreSQL container), set `POSTGRES_PORT`:

```bash
# Combined build (both extensions)
cd docker
POSTGRES_PORT=5434 docker compose -f docker-compose.yml up -d

# pg_facets only
cd extensions/pg_facets/docker
POSTGRES_PORT=5434 docker-compose up -d
```

### Running all tests (SQL + Go)

```bash
# If 5433 is free
./run_all_tests_docker.sh

# If 5433 is in use
POSTGRES_PORT=5434 ./run_all_tests_docker.sh
```

The script:

1. Builds and starts pg_facets (no submodule needed)
2. Runs SQL/Zig tests
3. Stops pg_facets, starts pg_facets_test, runs Go tests
4. Cleans up

### M1-specific fixes (already applied)

| Issue | Fix |
|-------|-----|
| `deps/pg_roaringbitmap` not found | Dockerfiles clone pg_roaringbitmap during build; no submodule required |
| Port 5433 already allocated | Use `POSTGRES_PORT=5434` (or any free port) |
| "database system is shutting down" | Added startup delay + retry loop for verification |
| pg_cron in shared_preload | Removed from pg_facets docker config (not in TimescaleDB HA image) |
| `filter_documents_by_facets_bitmap` crash with NULL | Fixed NULL return handling in Zig (set_return_null for roaringbitmap) |
