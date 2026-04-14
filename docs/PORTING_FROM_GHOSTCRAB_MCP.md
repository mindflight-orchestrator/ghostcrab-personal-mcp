# Porting commits from `ghostcrab-mcp` → `ghostcrab-sqlite-mcp`

This document is the reference guide for developers bringing upstream commits from
the PostgreSQL-first `ghostcrab-mcp` repository into this SQLite-only fork.

---

## 1. Fork history and divergence point

| Repo | Role |
|------|------|
| `ghostcrab-mcp` | Upstream, PostgreSQL-first. Has both a `postgres` and `sqlite` branch in `createDatabaseClient`. Requires a running PostgreSQL + native extensions (pg_facets, pg_dgraph, pg_pragma) for full functionality. |
| `ghostcrab-sqlite-mcp` | This repo. SQLite-only. The Node.js MCP server talks to a **dedicated Zig HTTP backend** (`cmd/backend/ghostcrab-backend`) that owns the SQLite file. No pg driver in this process. |

`ghostcrab-sqlite-mcp` was forked at commit `45c30dd` ("converted version for ghostcrab-mcp for sqlite"). Since then both repos have diverged: `ghostcrab-mcp` received feature commits that are not yet in `ghostcrab-sqlite-mcp`.

---

## 2. Architectural difference — one rule to remember

```
ghostcrab-mcp                         ghostcrab-sqlite-mcp
─────────────────────────────────     ────────────────────────────────────────────
Node MCP server                       Node MCP server
  └─ Pool (pg)    ─────▶ PostgreSQL     └─ fetch() ─▶ ghostcrab-backend (Zig/HTTP)
  └─ fetch()      ─▶ MindBrain HTTP                       └─ SQLite file
```

**In this repo, `context.database.kind` is always `"sqlite"`.**
The `kind` field exists solely so existing tool code that branches on it keeps
working without needing a refactor; every branch that checks `"postgres"` is dead
code and should be removed when porting.

---

## 3. File-level map of structural differences

### 3.1 Files unique to `ghostcrab-sqlite-mcp` (do not touch when porting)

| File | Purpose |
|------|---------|
| `cmd/backend/build.zig` | Zig build for the `ghostcrab-backend` binary |
| `cmd/backend/http_server.zig` | The backend HTTP server; serves all `/api/mindbrain/*` routes |
| `vendor/mindbrain` → `../../mindbrain` | Symlink to the mindbrain library (standalone mode) |
| `vendor/ztoon` → `vendor/mindbrain/deps/ztoon` | Symlink to the ztoon library |
| `src/db/standalone-mindbrain.ts` | HTTP client helpers for the backend (SQL sessions, traverse, pack, workspace-export) |
| `scripts/ensure-vendor.sh` | Sets up `vendor/` symlinks for the Zig build |
| `scripts/smoke-backend.sh` | End-to-end smoke test: backend + SQL + sessions |
| `tools/workspace/export-toon.ts` | SQLite-specific workspace toon export tool |

### 3.2 Files unique to `ghostcrab-mcp` — handle when porting

| File | Action when porting to sqlite-mcp |
|------|-----------------------------------|
| `src/mcp/agent-brief.ts` | Port directly — schema-agnostic content |
| `src/tools/pragma/guidance.ts` | Port directly; remove any `postgres`-only branch |
| `src/tools/zod-errors.ts` | Port directly — no db dependency |
| `src/db/migrations/` | **Do not port.** Schema migrations run inside the Zig backend. |
| `src/db/native-bootstrap.ts` | **Do not port.** PostgreSQL native extensions don't exist here. |
| `src/db/extension-probe.ts` | **Do not port.** In this repo `extensions` is always the all-false literal. |
| `src/db/facets-registration.ts` | **Do not port.** pg_facets-specific. |
| `src/db/facets-maintenance.ts` | **Do not port.** pg_facets-specific. |
| `src/db/maintenance.ts` | Review: remove any pg_dgraph-native calls; keep SQL-level logic. |

### 3.3 Files present in both repos — always require adaptation

| File | What changed in sqlite-mcp | Porting rule |
|------|---------------------------|--------------|
| `src/config/env.ts` | Removed `DatabaseKind`, `databaseKind`, `databaseUrl`, `pgPoolMax`, `DEFAULT_DATABASE_URL`, `DEFAULT_POOL_MAX`, `redactDatabaseUrl`, `parseDatabaseKind` | Never re-add these. See §4 for substitutions. |
| `src/db/client.ts` | Removed `pg` import and postgres client entirely; `DatabaseKind = "sqlite"` | When a commit adds something to `client.ts`, only port the sqlite path. |
| `src/server.ts` | Removed postgres bootstrap, embedding-dimension check, native extension probing; `extensions` is the all-false literal inline | Port new tool registrations, instructions updates, etc.; skip postgres-guarded blocks. |
| `src/cli/context.ts` | Removed postgres branch from `initToolContext`; now throws on unreachable backend | Port argument and return changes. |
| `src/cli/migrate.ts` | Replaced with a no-op that logs "handled by backend" | Keep as no-op; the Zig backend applies schema on startup. |
| `src/cli/runner.ts` | Removed `maintenance refresh-entity-degree`, `register-pg-facets`, `merge-facet-deltas` commands | Do not re-add these. |
| `package.json` | Removed `pg`, `better-sqlite3`, `@types/pg`, `@types/better-sqlite3`; added `backend:*` scripts | Never add `pg` or `better-sqlite3` back. |
| `Makefile` | Replaced all Docker/Postgres targets with `backend-*` targets | Use `backend-build`/`backend-dev`; do not add `dev-up`/`dev-down`/`dev-migrate`. |
| `.env.example` | Replaced `DATABASE_URL`/`PG_POOL_MAX`/`GHOSTCRAB_DATABASE_KIND` with `GHOSTCRAB_BACKEND_ADDR`/`GHOSTCRAB_SQLITE_PATH` | Use the sqlite-mcp version as canonical. |

---

## 4. Substitution table for porting code

Apply these mechanical substitutions when cherry-picking or manually porting a diff:

| `ghostcrab-mcp` pattern | `ghostcrab-sqlite-mcp` replacement |
|-------------------------|-------------------------------------|
| `import { ... } from "pg"` | Remove entirely |
| `import 'better-sqlite3'` | Remove entirely |
| `config.databaseUrl` | Remove or replace with `config.mindbrainUrl` (if logging connection target) |
| `config.pgPoolMax` | Remove |
| `config.databaseKind` | Remove; assume always `"sqlite"` |
| `redactDatabaseUrl(...)` | Use the URL directly, or drop the log line |
| `if (database.kind === "postgres") { ... }` | Remove the entire block |
| `if (database.kind === "sqlite") { ... } else { ... }` | Keep only the sqlite branch; remove the else |
| `context.database.kind === "sqlite"` conditional | Simplify to `true` or remove the check |
| `DatabaseKind` (from env.ts) | Do not import; `DatabaseKind` is only exported from `src/db/client.ts` as `"sqlite"` |
| `resolveExtensionCapabilities(...)` | Remove; use the inline literal `{ pgFacets: false, pgDgraph: false, pgPragma: false, pgMindbrain: false }` |
| `ensureBootstrapData(...)` | Remove; bootstrap is handled by the Zig backend on startup |
| `bootstrapNativeWithReport(...)` | Remove |
| `getFacetsEmbeddingColumnDimension(...)` | Remove |
| SQL `$1, $2, ...` params | Supported — `transformSqliteQuery` in `client.ts` converts them to `?` |
| SQL `ILIKE`, `now()`, `TRUE/FALSE`, `::type` casts | `transformSqliteQuery` handles these automatically |
| SQL `to_regclass(...)` | **Not handled** — remove or gate these queries entirely |
| SQL `CREATE EXTENSION ...` | Remove; SQLite has no extensions |
| SQL `CREATE SCHEMA ...` | Remove; SQLite has no schemas |
| SQL referencing `mindbrain.` prefix | `transformSqliteQuery` strips it automatically |
| SQL referencing `graph.entity` | `transformSqliteQuery` rewrites to `graph_entity` |

---

## 5. Per-category porting checklist

### New MCP tools

1. Copy the tool file into `src/tools/<category>/`.
2. Find any `if (context.database.kind === "postgres")` block → remove it.
3. Find any `if (context.database.kind === "sqlite")` block → flatten it (make the body unconditional).
4. Check for `to_regclass`, `CREATE SCHEMA`, `CREATE EXTENSION`, `pg_catalog` references → remove or skip with a no-op return.
5. Verify all SQL uses `?` params or `$N` params (both work via `transformSqliteQuery`).
6. Register the tool in `src/tools/register-all.ts` if not already there.

### New CLI commands (runner.ts)

1. Port the command definition.
2. Remove any postgres-guarded block inside the handler.
3. Remove any reference to `config.databaseUrl`, `config.pgPoolMax`, or `redactDatabaseUrl`.
4. If the handler calls `initToolContext`, verify it's the sqlite-mcp version (see `src/cli/context.ts`).

### New bootstrap / seed data (`src/bootstrap/seed.ts`)

Port freely — this file seeds the SQLite database with workspace/ontology records. The SQL in this file uses `$N` params which are converted by `transformSqliteQuery`. Do not add any `CREATE SCHEMA`, `CREATE EXTENSION`, or `pg_catalog` calls.

### New config fields (`src/config/env.ts`)

Port new env vars freely. Never add:
- `databaseKind` / `DatabaseKind` / `parseDatabaseKind`
- `databaseUrl` / `DEFAULT_DATABASE_URL`
- `pgPoolMax` / `DEFAULT_POOL_MAX`
- `redactDatabaseUrl`

### New migrations (`src/db/migrations/`)

**Do not port.** SQL schema migrations are applied by the Zig backend at startup via `db.applyStandaloneSchema()`. If a new migration introduces a table or column that GhostCrab tools depend on, that schema change must be added to the mindbrain standalone SQLite schema (`vendor/mindbrain/src/standalone/sqlite_schema.zig`).

---

## 6. Startup order (for documentation / README)

The startup sequence for this repo is:

```
1. make backend-build        # build ghostcrab-backend binary (once)
2. make backend-dev          # start the Zig backend on :8091, opens/creates data/ghostcrab.sqlite
3. npm run dev               # start the MCP server (connects to backend via GHOSTCRAB_MINDBRAIN_URL)
```

Or using env vars directly:

```sh
# Terminal 1 — backend
GHOSTCRAB_BACKEND_ADDR=:8091 GHOSTCRAB_SQLITE_PATH=data/ghostcrab.sqlite \
  cmd/backend/zig-out/bin/ghostcrab-backend

# Terminal 2 — MCP server
GHOSTCRAB_MINDBRAIN_URL=http://127.0.0.1:8091 npx tsx src/index.ts
```

The MCP server will print `WARNING: backend unreachable` and enter degraded mode if
the backend is not running when it starts.

---

## 7. Smoke test

After porting a batch of commits, verify the integration:

```sh
make backend-build      # rebuild with latest code
make smoke              # backend health + SQL + sessions + traverse
npm run typecheck       # TS types clean
```

---

## 8. Files and features permanently out of scope for this repo

The following exist in `ghostcrab-mcp` and will **never** be ported to `ghostcrab-sqlite-mcp`:

- Docker Compose stack for PostgreSQL (`docker/`)
- Native Zig PostgreSQL extensions (`extensions/pg_facets`, `extensions/pg_dgraph`, `extensions/pg_pragma`)
- `src/db/extension-probe.ts` — extension capability detection (always no-op here)
- `src/db/native-bootstrap.ts` — pg_facets/pg_dgraph bootstrapping
- `src/db/facets-registration.ts` — pg_facets table registration
- `src/db/facets-maintenance.ts` — pg_facets delta maintenance
- `maintenance register-pg-facets`, `maintenance merge-facet-deltas` CLI commands
- `VENDORED_PG17_PLAN.md` and any PostgreSQL 17 header vendoring
- `DATABASE_URL`, `PG_POOL_MAX`, `GHOSTCRAB_DATABASE_KIND` environment variables
