# Docker Postgres stack (PostgreSQL 17 + extensions)

This document describes how to run the same custom PostgreSQL image (with pgvector, roaringbitmap, pg_facets, pg_dgraph, pg_cron) used in Mindflight projects, and how to integrate it into a new project. It also defines the **Go project layout** for migrations and seeds so all Go apps using this stack share a consistent structure.

---

## 1. Overview

**mfo-postgres-ext** provides:

- **Extensions:** pg_facets, pg_dgraph (Zig-built), and their dependency pg_roaringbitmap.
- **Base image:** PostgreSQL 17 with [pgvector](https://github.com/pgvector/pgvector). The build also adds postgresql-contrib (pg_trgm) and pg_cron.
- **Graceful fallback:** If pg_facets or pg_dgraph fail to build (e.g. Zig OOM on small CI runners), the image still runs; those extensions are optional at init time.

Consuming projects add this repo as a **git submodule** and use a **Dockerfile** that copies extension sources from the submodule and builds them inside the image. Docker init scripts then enable the extensions in the database and in `template1`.

---

## 2. Integration contract

### Submodule

From your **project root**:

```bash
git submodule add https://github.com/mindflight-orchestrator/mfo-postgres-ext.git postgres/vendor/mfo-postgres-ext
git submodule update --init --recursive
```

So the layout under your repo is:

```
<project>/
  postgres/
    vendor/
      mfo-postgres-ext/    <- this repo
        extensions/
          pg_facets/
          pg_dgraph/
          pg_facets/deps/pg_roaringbitmap
```

### Paths used by the Dockerfile

The Dockerfile must be run with **build context = project root**. It expects:

| Path (relative to project root) | Purpose |
|---------------------------------|--------|
| `postgres/vendor/mfo-postgres-ext/extensions/pg_facets/` | src, sql, build.zig, pg_facets.control, deps/pg_roaringbitmap |
| `postgres/vendor/mfo-postgres-ext/extensions/pg_dgraph/` | src, sql, build.zig, pg_dgraph.control, deps/pg_roaringbitmap |
| Roaringbitmap | Built from `pg_facets/deps/pg_roaringbitmap` and installed once for both extensions |

Ensure the submodule is initialized before building the image (`git submodule update --init`).

---

## 3. Recreating the Docker Postgres in another project

### Directory layout

At **project root**, create (or copy from a reference implementation):

```
<project>/
  postgres/
    Dockerfile.postgres      # Multi-stage build (builder + final)
    postgresql.conf          # Copied into image, then into PGDATA at runtime
    docker-entrypoint.sh     # Copies postgresql.conf to PGDATA, then execs official entrypoint
    init/
      01-init-postgres.sql   # CREATE EXTENSION + optional GRANT for app user/db
      02-init-template1.sh   # Same extensions in template1
  postgres/vendor/mfo-postgres-ext   # Submodule (see above)
  docker-compose.yml         # Service that builds from context . and dockerfile postgres/Dockerfile.postgres
```

### docker-compose snippet

```yaml
services:
  postgres:
    build:
      context: .
      dockerfile: postgres/Dockerfile.postgres
    container_name: myapp-postgres   # Replace with your app name
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-myapp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-myapp}
      POSTGRES_DB: ${POSTGRES_DB:-myapp}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-myapp}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

Build and run from project root: `docker-compose up -d postgres`.

### Dockerfile

Use the same multi-stage pattern as the reference implementation:

- **Stage 1 (builder):** Ubuntu 22.04, PostgreSQL 17 dev packages, Zig 0.15.2 (multi-arch: amd64/arm64). Build and install: pg_cron, pg_roaringbitmap (from vendor), pg_facets (Zig), pg_dgraph (Zig). On Zig build failure, create placeholder files so the final image still builds.
- **Stage 2 (final):** Base `pgvector/pgvector:pg17`, install postgresql-contrib-17. Copy .so, .control, and SQL from builder. Copy `postgres/postgresql.conf` and `postgres/docker-entrypoint.sh` into the image. Copy `postgres/init/*` into `/docker-entrypoint-initdb.d/`. Set ENTRYPOINT to the custom entrypoint.

All `COPY` paths are relative to **build context (project root)**, e.g. `COPY postgres/vendor/mfo-postgres-ext/...`, `COPY postgres/postgresql.conf ...`.

Reference: [mindbot postgres/Dockerfile.postgres](https://github.com/mindflight/mindbot/blob/main/postgres/Dockerfile.postgres) (same repo layout and vendor paths).

### postgresql.conf

Copy from the reference or use a minimal config: `listen_addresses = '*'`, `port = 5432`, `shared_buffers`, `effective_cache_size`, logging. The custom entrypoint copies this file into `$PGDATA` at container start so Postgres uses it.

### Init scripts

- **01-init-postgres.sql**  
  - `CREATE EXTENSION IF NOT EXISTS` for: vector, roaringbitmap, pg_trgm.  
  - Optional blocks with `DO $$ ... EXCEPTION` for pg_facets, pg_dgraph, pg_cron (so missing extensions do not fail init).  
  - At the end: `GRANT ALL PRIVILEGES ON DATABASE <APP_DB> TO <APP_USER>;` — replace placeholders with your app’s database and user.

- **02-init-template1.sh**  
  - Same extensions in `template1` so any new database created later gets them. Run with `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname template1`.

---

## 4. Go project layout: migrations and seeds

When using **Go** to run migrations and seeds (recommended for consistency across Mindflight Go apps), use a single, well-defined layout. The Docker init scripts above only create the database user and enable extensions; they do **not** run application schema or seed data. That is the responsibility of your Go code, using the same directories and ordering every time.

### Directories

| Directory       | Purpose |
|----------------|---------|
| `db/migration/` | Schema migrations (DDL): tables, indexes, enums, etc. |
| `db/seed/`      | Reference data (DML): gateways, agents, facets, configs, etc. |

- **Naming:** SQL files with a numeric prefix, sorted lexicographically, e.g. `001_base_schema.sql`, `002_gateway_catalog.sql`, `003_enum_extensions.sql`, and in seed `001_gateway_github.sql`, `002_local_tools_facets.sql`.
- **Order:** Migrations run first (in order), then seeds (in order). The application must run with **working directory = project root** so that relative paths `db/migration` and `db/seed` resolve correctly.
- **Execution:** A single `Migrate(ctx, pool)` (or equivalent) function that:  
  1. Loads all `db/migration/*.sql` in sorted order.  
  2. Runs migrations 001 and 002 inside a **transaction** (plain DDL).  
  3. Runs migrations 003 and later **outside** a transaction (so that `ALTER TYPE ... ADD VALUE` and similar statements are allowed).  
  4. Loads all `db/seed/*.sql` in sorted order and runs them (no transaction required, but possible if desired).

This keeps schema and seed data under version control, run at application startup or via a dedicated CLI, and ensures every Go project using this Postgres stack has the same layout and behavior.

Example (conceptual):

```
<project>/
  db/
    migration/
      001_base_schema.sql
      002_gateway_catalog.sql
      003_enum_extensions.sql
      004_learning_data.sql
    seed/
      001_gateway_github.sql
      002_local_tools_facets.sql
      ...
  internal/
    db/
      migrations.go   # Migrate(ctx, pool) reading db/migration and db/seed
```

Reference: [mindbot internal/db/migrations.go](https://github.com/mindflight/mindbot/blob/main/internal/db/migrations.go) and its `db/migration` / `db/seed` layout.

---

## 5. Build requirements

- **Docker build context:** Project root (so `COPY postgres/...` and `COPY postgres/vendor/...` work).
- **Builder stage:** Ubuntu 22.04, PostgreSQL 17 server-dev, Zig 0.15.2. Multi-arch builds use `TARGETARCH` plus runtime arch detection (`uname -m`), with explicit Zig Linux GNU targets (`x86_64-linux-gnu` / `aarch64-linux-gnu`) for extension linking compatibility.
- **Final image:** `pgvector/pgvector:pg17`, plus `postgresql-contrib-17`. Extensions and config/entrypoint/init as above.
- **Graceful degradation:** If Zig builds for pg_facets or pg_dgraph fail, the Dockerfile creates placeholder files and the image still runs; init scripts use `DO $$ ... EXCEPTION` so missing extensions do not abort database creation.

---

## 6. Troubleshooting

- **Extensions not installed:** Run `docker-compose build --no-cache postgres` and ensure `postgres/vendor/mfo-postgres-ext` is present and populated (`git submodule update --init`).
- **Build failures (Zig / pg_facets / pg_dgraph):** See mindbot docs [TROUBLESHOOTiNG_INSTALL_PG.md](https://github.com/mindflight/mindbot/blob/main/docs/TROUBLESHOOTiNG_INSTALL_PG.md) and [TROUBLESHOOTING_M1_PG_FACETS.md](https://github.com/mindflight/mindbot/blob/main/docs/TROUBLESHOOTING_M1_PG_FACETS.md) for root causes and fixes. On ARM64 (e.g. M1), do a full no-cache build once after cloning so extension layers are built for the correct arch.
- **Verify extensions in container:**  
  `docker exec -it <container> psql -U <user> -d <db> -c "\dx"`

---

## 7. Checklist for a new project

1. Add submodule: `postgres/vendor/mfo-postgres-ext` (see §2).
2. Create `postgres/` with Dockerfile, postgresql.conf, docker-entrypoint.sh, init scripts (from §3 or from mindbot).
3. Add the postgres service to docker-compose with `context: .` and `dockerfile: postgres/Dockerfile.postgres` (§3).
4. Replace placeholders: container name, POSTGRES_USER, POSTGRES_DB, and in 01-init-postgres.sql the `GRANT ... ON DATABASE <APP_DB> TO <APP_USER>`.
5. (Go projects) Create `db/migration/` and `db/seed/`, implement `Migrate(ctx, pool)` as in §4; run it on startup or via CLI after Postgres is up.
6. Build and run: `docker-compose up -d postgres`, then run app migrations/seeds with your app’s tooling.
