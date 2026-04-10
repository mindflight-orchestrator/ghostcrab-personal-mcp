# Plan: Vendor PostgreSQL 17 Dev Files (ext_pg17_src)

## Goal

Bundle PostgreSQL 17 headers and PGXS in the repo as `ext_pg17_src/` so that:

- **Docker**: Build without `apt-get install postgresql-server-dev-17` (no network/apt in builder)
- **Native**: Build without Postgres.app or Homebrew PostgreSQL installed
- **Self-contained**: All build deps in repo, reproducible builds

---

## What to Vendor

From [PostgreSQL 17 source](https://www.postgresql.org/ftp/source/v17.2/):

| Path | Purpose |
|------|---------|
| `src/include/` | Headers (server, lib, port, common, etc.) |
| `src/interfaces/libpq/` | libpq headers (if needed) |
| `config/` | PGXS config (install-sh, etc.) |
| `src/makefiles/` | PGXS makefiles |

Estimated size: ~2–3 MB (headers + makefiles only, no .c sources).

---

## Layout

```
mfo-postgres-ext/
  ext_pg17_src/           # Vendored PostgreSQL 17 dev files
    include/              # -> src/include from tarball
      server/
      lib/
      port/
      common/
      ...
    config/               # PGXS config scripts
    makefiles/            # PGXS makefiles (pgxs.mk lives here)
  scripts/
    pg_config_wrapper     # Fake pg_config that returns vendored paths
```

---

## Build Changes

### 1. pg_config Wrapper

Create `scripts/pg_config_wrapper` that responds to:

```
--version          → PostgreSQL 17.x
--includedir-server → ext_pg17_src/include/server (absolute from repo root)
--pgxs             → ext_pg17_src/pgxs or path to pgxs.mk
--pkglibdir        → /tmp/pg_build/lib (Docker) or $(pg_config --pkglibdir) if real pg_config exists
--sharedir         → /tmp/pg_build/share (Docker) or real
```

For Docker: wrapper returns install dirs under `/tmp/pg_build/` so `make install` writes there; we then COPY from there.

### 2. pg_roaringbitmap

Makefile uses `PG_CONFIG = pg_config` and `include $(shell pg_config --pgxs)`.

- Set `PG_CONFIG=/path/to/scripts/pg_config_wrapper` when invoking make
- Wrapper’s `--pgxs` returns path to vendored `ext_pg17_src/.../pgxs.mk`
- Wrapper’s `--includedir-server` returns vendored include path

PGXS also sets CFLAGS, LDFLAGS, etc. The vendored PGXS must be self-contained. We may need to copy/adjust PGXS from the tarball so it works with vendored headers only (no real PostgreSQL libs). Extensions are loadable modules; linking typically allows undefined symbols (resolved at load time).

### 3. Zig Extensions (pg_facets, pg_dgraph)

build.zig uses `pg_config --includedir-server`. Add:

- Env var `PG_HEADERS_VENDORED` or path `ext_pg17_src`
- If present, use vendored path instead of calling pg_config
- Relative from each extension: `../../ext_pg17_src/include/server` (or via b.path)

### 4. Docker

Remove:

```dockerfile
RUN curl ... apt-get install postgresql-server-dev-17
```

Add:

```dockerfile
COPY ext_pg17_src /tmp/ext_pg17_src
ENV PG_CONFIG=/tmp/ext_pg17_src/pg_config_wrapper
# or
ENV PATH="/tmp/ext_pg17_src:${PATH}"  # if wrapper is named pg_config
```

Build context must include `ext_pg17_src/` (at repo root). Docker build is run from `extensions/pg_facets/` or `extensions/pg_dgraph/` — need to ensure COPY paths are correct (e.g. build from repo root, or adjust COPY).

### 5. scripts/build-macos.sh

If `ext_pg17_src` exists and pg_config/PGXS is missing:

- Prefer vendored build
- Set PG_CONFIG to wrapper
- Or add vendored include path for Zig

---

## Extracting Vendored Files

Script to populate `ext_pg17_src/` from a PostgreSQL tarball:

```bash
#!/bin/bash
# scripts/fetch_pg17_headers.sh
PG_VER=17.2
wget https://ftp.postgresql.org/pub/source/v${PG_VER}/postgresql-${PG_VER}.tar.bz2
tar -xf postgresql-${PG_VER}.tar.bz2
mkdir -p ext_pg17_src
cp -r postgresql-${PG_VER}/src/include ext_pg17_src/
cp -r postgresql-${PG_VER}/config ext_pg17_src/
# Copy PGXS makefiles
mkdir -p ext_pg17_src/pgxs
cp -r postgresql-${PG_VER}/src/makefiles/* ext_pg17_src/pgxs/
# Add pg_config wrapper
# ...
```

Run once, commit `ext_pg17_src/`. Optional: add to CI to refresh on PG 17 patch releases.

---

## License

PostgreSQL License (similar to MIT/BSD). Redistribution of headers is allowed.

---

## PGXS Constraint

**PGXS requires the full PostgreSQL source tree** — it includes `$(top_builddir)/src/Makefile.global` and `Makefile.shlib`, which pull in dozens of generated configs and rules. Headers alone are not enough for `pg_roaringbitmap` when using PGXS.

### Two Viable Approaches

**A) PostgreSQL as git submodule (full source)**

- Add `git submodule add https://github.com/postgres/postgres ext_pg17_src`
- Checkout tag `REL_17_2` (or current 17.x)
- Build from this tree; PGXS works as usual
- Repo stores only the submodule pointer (~100 bytes); `git submodule update` fetches ~100MB
- Docker: `COPY ext_pg17_src` or clone submodule in builder

**B) Minimal headers + standalone pg_roaringbitmap Makefile**

- Vendor only `src/include/` (~2MB)
- Add `Makefile.standalone` for pg_roaringbitmap that compiles without PGXS (manual CFLAGS, `-shared`/`-bundle`)
- Bypasses PGXS entirely; no full PostgreSQL source
- More maintenance, but smaller and self-contained

---

## Open Points

1. **Install layout** – `make install` writes to `pkglibdir` and `sharedir`. Ensure layout matches what we COPY into the final image.
2. **Build context** – Dockerfiles: `COPY ext_pg17_src` assumes context is repo root.
3. **Choose A or B** – Submodule (full source) vs standalone Makefile (headers only).

---

## Recommended: Option A (PostgreSQL Submodule)

```bash
# Add PostgreSQL 17 as submodule
git submodule add https://github.com/postgres/postgres.git ext_pg17_src
cd ext_pg17_src && git checkout REL_17_2 && cd ..

# Commit the submodule reference
git add ext_pg17_src .gitmodules
git commit -m "Add PostgreSQL 17 source as submodule for self-contained builds"
```

Then update Dockerfiles to use vendored build (no `apt-get install postgresql-server-dev-17`).
