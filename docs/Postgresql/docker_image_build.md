# PostgreSQL Docker image build (MindBot)

This document is the **single reference** for version pins and prerequisites when building the full PostgreSQL image with `pg_facets`, `pg_dgraph`, `pg_pragma`, plus supporting extensions. The **source of truth for exact pins** remains [`docker/Dockerfile.postgres`](../../docker/Dockerfile.postgres) (duplicate values here only for human readability—update both when bumping).

## Quick build

From the repository root (required build context):

```bash
docker compose build postgres
# or
docker build -f postgres/Dockerfile.postgres -t mindbot-postgres:local .
```

## Architecture

| Layer | Choice | Notes |
|--------|--------|--------|
| Final base image | `pgvector/pgvector:pg17` | Supplies PostgreSQL **17** and **pgvector**; MindBot layers extensions on top. |
| Builder base | `ubuntu:22.04` | Jammy; PGDG repo adds `postgresql-server-dev-17`. |
| PostgreSQL major | `17` (`PG_MAJOR`) | Must match `pgvector` tag and `postgresql-server-dev-$PG_MAJOR`. |

## Zig and Zig extensions

Extensions **pg_facets**, **pg_dgraph**, and **pg_pragma** are built with **Zig** (shared libraries linked against PostgreSQL server headers).

| Pin | Typical value | Where defined |
|-----|----------------|---------------|
| Zig toolchain | e.g. `0.15.2` | `ENV ZIG_VERSION` in builder stage |
| Download arch | `x86_64-linux` or `aarch64-linux` | `ARG TARGETARCH` → `ZIG_ARCH` (Docker multi-platform) |

**Compatibility rule:** The vendored `build.zig` files target the **Zig 0.15** build API (e.g. `addLibrary`, `createModule`). If you change `ZIG_VERSION`, confirm the extensions still compile; older Zig will not understand this API.

**Build command inside Dockerfile:** `zig build -Doptimize=ReleaseFast` in each extension directory.

## Other extensions and dependencies

| Component | Version / source | Role |
|-----------|------------------|------|
| **roaringbitmap** | Vendored under each extension repo (`extensions/pg_facets/deps/pg_roaringbitmap`, etc.) | Built with `make`; required by facet/graph/pragma stacks. |
| **pg_cron** | Git tag `v1.6.5` | Scheduled jobs in Postgres. |
| **postgresql-contrib-17** | Apt on final image | Ensures `pg_trgm` and other contrib modules. |

## Vendored source layout (required in build context)

The Dockerfile `COPY`s from:

- `postgres/vendor/mfo-postgres-ext/extensions/pg_facets/` (subset: `src`, `sql`, `build.zig`, `pg_facets.control`, `deps/pg_roaringbitmap`)
- Same pattern for `pg_dgraph` and `pg_pragma`

If this tree is missing or incomplete, the image build will fail at `COPY` or at compile time.

**Naming:** The extension is **`pg_pragma`** (memory projection), not `pg_memoproj`.

## Runtime files copied into the image

- `postgres/postgresql.conf` — applied via custom entrypoint into `PGDATA`.
- `postgres/docker-entrypoint.sh` — wraps default Postgres entrypoint.
- `postgres/init/01-init-postgres.sql`, `02-init-template1.sh` — first-time cluster init.

See also: [`docs/bootstrap/production_database_bootstrap.md`](../bootstrap/production_database_bootstrap.md) for **SQL/bootstrap** on a running instance (not for building the image).

## Fallback behavior (Zig build failures)

The Dockerfile tolerates failed Zig builds by creating **empty placeholder** `.so` files so the build can finish. The final stage only installs extensions when the copied `.so` is **non-empty**. In practice:

- A **successful** build produces real `libpg_facets.so`, `libpg_dgraph.so`, `libpg_pragma.so` and SQL scripts.
- If you see warnings about build failure / OOM during `docker build`, treat the resulting image as **incomplete** for features that depend on those extensions.

For a **full** image locally, ensure enough Docker memory/CPU for Zig ReleaseFast builds, or build on a machine with more resources.

## Bump checklist

When upgrading PostgreSQL major, Zig, or extension sources:

1. Update `postgres/Dockerfile.postgres` (`PG_MAJOR`, base image tag, `postgresql-server-dev-*`, `postgresql-contrib-*`, `ZIG_VERSION` if needed).
2. Align `pgvector/pgvector:pgXX` with the same major.
3. Re-run `docker compose build postgres` on both `linux/amd64` and `linux/arm64` if you ship multi-arch.
4. Run integration tests or manual `CREATE EXTENSION` checks for `vector`, `roaringbitmap`, `pg_facets`, `pg_dgraph`, `pg_pragma`, `pg_cron` as applicable.
5. Refresh the version table in **this** document to match the Dockerfile.
