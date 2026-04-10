# Docker

The `docker/` folder now exposes two explicit paths:

- `Dockerfile.postgres` + `docker-compose.native.yml`: native Postgres stack for GhostCrab validation and extension-backed runtime work
- `Dockerfile` + `docker-compose.yml`: SQL-first fallback when you explicitly want a portable baseline

## Native Path

Use this when you want GhostCrab to exercise `pg_facets`, `pg_dgraph`, and `pg_pragma`.

```bash
docker compose -f docker/docker-compose.native.yml build
docker compose -f docker/docker-compose.native.yml up -d
docker exec ghostcrab_postgres_native psql -U ghostcrab -d ghostcrab -c "SELECT extname FROM pg_extension WHERE extname IN ('pg_facets', 'pg_dgraph', 'pg_pragma')"
```

What it does:

- builds and copies the native extension libraries into the image
- creates native extensions during init in dependency order
- keeps credentials aligned with the main GhostCrab defaults (`ghostcrab` / `ghostcrab`)

## Fallback Path

Use this when you want a runnable PostgreSQL baseline without depending on local Zig, `pg_config`, or finalized native version pins.

```bash
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
docker exec ghostcrab_postgres psql -U ghostcrab -d ghostcrab -c "SELECT 1"
```

What it does:

- starts from `pgvector/pgvector`
- installs PostgreSQL contrib modules
- attempts `CREATE EXTENSION` for `pg_trgm`, `vector`, `uuid-ossp`
- attempts `CREATE EXTENSION` for `pg_facets`, `pg_dgraph`, `pg_pragma` without failing startup if they are absent

What it does not do:

- it does not apply the application schema automatically
- it does not start the MCP server container yet

After the container is healthy, apply the GhostCrab schema from the repository root:

```bash
npm run migrate
npm run smoke:mcp
```

The defaults in `.env.example` are intentionally provisional until the canonical version-pinning document is imported from the neighboring project.

## CI: native image build (no registry push)

GitHub Actions workflow [`.github/workflows/docker-build.yml`](../.github/workflows/docker-build.yml) builds `Dockerfile.postgres` for `linux/amd64` with `--load`, runs the container, and waits for the image `HEALTHCHECK` (which verifies `pg_facets` / `pg_dgraph` / `pg_pragma` in `pg_extension`). Nothing is pushed to DockerHub; publishing is a separate step when registry credentials exist.
