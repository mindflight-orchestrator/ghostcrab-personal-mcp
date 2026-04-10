# GhostCrab — Internal Technical Reference

This document covers repository layout, boot contracts, migration details, seeded data, validation scripts, telemetry, and packaging. It is the canonical internal reference for contributors and maintainers.

For the public-facing overview, see the root [README.md](../README.md).

---

## Repository Layout

```text
ghostcrab/
├── src/                  # MCP server, DB runtime, and public ghostcrab_* tools
├── tests/                # unit tests for server, tools, and migrations
├── docker/               # native Postgres image + SQL fallback assets
├── extensions/           # native PostgreSQL extension sources
└── docs/                 # imported canonical roadmap and SOPs
```

## Native Extension Sources

Native extension sources for PostgreSQL live under `extensions/` and track these upstream Git repositories:

- [`mindflight-orchestrator/pg_facets`](https://github.com/mindflight-orchestrator/pg_facets)
- [`mindflight-orchestrator/pg_dgraph`](https://github.com/mindflight-orchestrator/pg_dgraph)
- [`mindflight-orchestrator/pg_pragma`](https://github.com/mindflight-orchestrator/pg_pragma)

Vendored copies are committed for offline CI and local builds. See [`docs/setup/extension_sources.md`](setup/extension_sources.md) for cloning, private-repo access, and optional submodule migration.

## What Ships in the Current Build

- a real MCP stdio server backed by `@modelcontextprotocol/sdk`
- a fail-fast PostgreSQL runtime via `pg`
- a checksum-based SQL migration runner
- a native Docker PostgreSQL path that ships `pg_facets`, `pg_dgraph`, and `pg_pragma`
- a SQL-first fallback path that remains available for explicit portability checks
- a stable public `ghostcrab_*` tool surface with a documented response envelope
- a real `mfo:system` bootstrap plus canonical GhostCrab schemas and starter ontology data
- a seeded GhostCrab product graph in `mfo_nodes` / `mfo_edges` with a stable intentional gap for coverage and traversal validation
- a seeded `agent:self` runtime state plus projections for realistic `ghostcrab_pack` and `ghostcrab_status` demos
- an embeddings runtime with two rails: deterministic fake-first validation and opt-in real OpenRouter validation
- product-facing schemas for GhostCrab itself such as runtime components, roadmap PRs, distribution targets, and native compatibility
- a seeded autonomy and modeling layer across six activity families so clients can discover recipes, KPI patterns, and projection strategy dynamically
- a runnable Node stdio example client and tarball verification via `npm pack --dry-run`

The repository ships both a native PostgreSQL image and a SQL-first fallback. Validation defaults to the native image in [docker/Dockerfile.postgres](../docker/Dockerfile.postgres); the fallback path in [docker/Dockerfile](../docker/Dockerfile) remains available when you explicitly want portable SQL-only bootstrap.

## Native Boot / Seed Contract

GhostCrab boot and seed are expected to run against the native PostgreSQL Docker stack, not the SQL-only fallback. In practice that means:

- start PostgreSQL with [docker/docker-compose.native.yml](../docker/docker-compose.native.yml)
- keep `MFO_NATIVE_EXTENSIONS=native` for real bootstrap / seed runs
- ensure the database has `pg_facets`, `pg_dgraph`, `pg_pragma`, and `roaringbitmap` loaded before `npm run migrate` or `node dist/index.js`

The runtime validates this contract during boot and seed:

- `npm run migrate` checks extension presence and native bootstrap readiness
- `node dist/index.js` checks the same contract during server startup
- in `native` mode, GhostCrab fails fast if the required native stack is not available

Useful live check:

```bash
docker compose -f docker/docker-compose.native.yml exec postgres psql -U ghostcrab -d ghostcrab -c \
  "SELECT extname FROM pg_extension WHERE extname IN ('pg_facets', 'pg_dgraph', 'pg_pragma', 'roaringbitmap') ORDER BY extname"
```

If you are switching from an older fallback container or volume, reset the stack first so Docker does not silently reuse stale state:

```bash
docker compose -f docker/docker-compose.native.yml down -v
docker compose -f docker/docker-compose.native.yml up -d --build postgres
```

## Database Workflow

The application schema is managed through lexicographically ordered SQL files in `src/db/migrations/`.

- `npm run migrate` acquires a PostgreSQL advisory lock
- each applied file is recorded with a checksum in `mfo_schema_migrations`
- a changed checksum on an already applied filename is treated as an error
- `004_bootstrap_data.sql` remains a no-op; canonical bootstrap data is now seeded idempotently by the Node runtime after migrations

## Seeded Product Graph

Bootstrap seeds a real GhostCrab product graph directly into `mfo_nodes` and `mfo_edges`.

- the source of truth remains [src/bootstrap/seed.ts](../src/bootstrap/seed.ts)
- ontology concepts reused in the graph keep the same ids as `mfo:ontology.node_id`
- product graph nodes use `properties.domain = "ghostcrab-product"` when they count toward coverage
- one concept, `concept:ghostcrab:native-compatibility`, is intentionally left outside domain coverage so the default graph stays honestly partial
- the expected public behavior on a fresh bootstrap is `coverage_score = 0.833` with `recommended_action = "proceed_with_disclosure"`

See [docs/seeded_product_graph.md](seeded_product_graph.md) for full conventions.

## Autonomy, Recipes, and KPIs

Bootstrap also seeds a compact meta layer for agent autonomy and discovery.

- `ghostcrab_status` now exposes autonomy and projection guidance
- `ghostcrab_status` also exposes routing hints, signal patterns, and ingest patterns
- `ghostcrab_pack` can detect an activity family and surface the recipe and KPI patterns it used
- `ghostcrab_project` provides a real public path for provisional projection writes
- canonical bootstrap currently covers six activity families:
  - workflow-tracking
  - software-delivery
  - incident-response
  - compliance-audit
  - crm-pipeline
  - knowledge-base

This is designed to keep client prompts short while moving living modeling knowledge into GhostCrab itself.

## Public Tool Surface

The current public surface is organized around four workflows:

- `ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_count`
- `ghostcrab_upsert` for current-state fact updates without duplicates
- `ghostcrab_schema_register`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect`
- `ghostcrab_coverage`, `ghostcrab_traverse`, `ghostcrab_learn`
- `ghostcrab_pack`, `ghostcrab_project`, `ghostcrab_status`

The stable contract for these tools is documented in [docs/mcp_tools_contract.md](mcp_tools_contract.md).

## Validation

The main end-to-end entrypoint is:

```bash
PG_PORT=55432 npm run verify:e2e
```

It runs:

- formatting, lint, build, unit tests
- `npm pack --dry-run` verification
- Native PostgreSQL startup with `pg_facets`, `pg_dgraph`, and `pg_pragma`
- migrations, native bootstrap checks, and seed validation
- MCP smoke scenarios:
  - general public surface
  - incomplete graph behavior
  - memory workflow
  - example Node client

Standalone smoke scripts are also available:

```bash
npm run smoke:mcp
npm run smoke:mcp:embeddings-fake
npm run smoke:mcp:embeddings-real
npm run smoke:mcp:incomplete-graph
npm run smoke:mcp:memory-workflow
npm run embeddings:backfill -- --dry-run
npm run smoke:example-client
npm run verify:pack
```

For deterministic local embedding validation without any external provider:

```bash
GHOSTCRAB_EMBEDDINGS_MODE=fake npm run smoke:mcp:embeddings-fake
```

For real provider validation against OpenRouter, keep `config.yaml` or env pointed at a real embeddings model and run:

```bash
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab npm run smoke:mcp:embeddings-real
```

The dedicated runtime behavior and precedence rules are documented in [docs/embeddings_runtime.md](embeddings_runtime.md).

### Intentionally deferred

- semantic vector search beyond the prepared interface and BM25 fallback path
- native Zig/PostgreSQL version pinning for extension builds

## Telemetry

GhostCrab can send an **optional, anonymous** startup ping to a **HTTPS** endpoint you configure. It is **opt-in**: nothing is generated, read, written, or sent unless you explicitly enable it.

### What is collected

When enabled, a single JSON payload may include:

- `schema_version`, `telemetry_id` (random UUID v4 stored locally under `GHOSTCRAB_TELEMETRY_STATE_DIR`, default `~/.ghostcrab/`; invalid local state is regenerated)
- `event_type` (`server_start`), `product` (`ghostcrab`), `product_version`
- `os`, `os_arch`, `runtime` (`node`), `runtime_version`
- `db_configured` (the startup DB reachability result captured for that startup attempt)
- `execution_mode`, `agent_host`, `agent_host_source` (declared or defaulted to `unknown`)
- `first_installed_at` (from local `telemetry-meta.json`), `sent_at`

### What is never collected

No IP address, hostname, username, local paths, project names, prompts, database contents, MCP payloads, tool names, or session identifiers.

### How to enable

Set `MCP_TELEMETRY=1` and a **`https://`** URL in `GHOSTCRAB_TELEMETRY_ENDPOINT` (see `.env.example`). Optional: `GHOSTCRAB_TELEMETRY_TIMEOUT_MS` (default `1500`), `GHOSTCRAB_TELEMETRY_DEBUG=1`, `GHOSTCRAB_AGENT_HOST`, `GHOSTCRAB_AGENT_HOST_SOURCE`, `GHOSTCRAB_EXECUTION_MODE`.

### How to disable

- Set `MCP_TELEMETRY=0` or leave it unset, or
- Pass **`--no-telemetry`** on the command line (forces `MCP_TELEMETRY=0` for that process).

Telemetry is sent on a best-effort basis during startup, using the DB reachability result already observed by the server. Failures are **non-blocking** and never prevent the server from starting.

Implementation lives under [`src/telemetry/`](../src/telemetry/) for auditing.

## Packaging and Client Integration

- npm tarball verification lives behind `npm run verify:pack`
- the example stdio client lives in [examples/node-stdio-client/index.mjs](../examples/node-stdio-client/index.mjs)
- the client integration guide lives in [docs/getting_started_mcp_client.md](getting_started_mcp_client.md)
- the Codex setup guide lives in [docs/codex_integration.md](codex_integration.md)

## Native Extension Assets

The PostgreSQL extension sources and native image assets that back the default GhostCrab bootstrap path:

- [docker/Dockerfile.postgres](../docker/Dockerfile.postgres)
- [docker/docker-compose.native.yml](../docker/docker-compose.native.yml)
- [extensions/pg_facets/README.md](../extensions/pg_facets/README.md)
- [extensions/pg_dgraph/README.md](../extensions/pg_dgraph/README.md)
- [extensions/pg_pragma/README.md](../extensions/pg_pragma/README.md)

## Canonical Docs Index

| Document | Description |
| :--- | :--- |
| [ROADMAP.md](../ROADMAP.md) | V1 audit checklist and deferred follow-ups |
| [docs/roadmap.md](roadmap.md) | Extended roadmap |
| [docs/mcp_tools_contract.md](mcp_tools_contract.md) | Stable public tool contract |
| [docs/getting_started_mcp_client.md](getting_started_mcp_client.md) | Client integration guide |
| [docs/codex_integration.md](codex_integration.md) | Codex setup and prompt-help entrypoint |
| [docs/architecture.md](architecture.md) | Architecture overview |
| [docs/known_limits.md](known_limits.md) | Known limitations |
| [docs/embeddings_runtime.md](embeddings_runtime.md) | Embeddings runtime and precedence rules |
| [docs/future_embedding_providers.md](future_embedding_providers.md) | Future embedding provider roadmap |
| [docs/seeded_product_graph.md](seeded_product_graph.md) | Seeded product graph conventions |
| [docs/agent_autonomy.md](agent_autonomy.md) | Agent autonomy layer |
| [docs/activity_families.md](activity_families.md) | Activity family definitions |
| [docs/projection_recipes.md](projection_recipes.md) | Projection recipes |
| [docs/kpi_patterns.md](kpi_patterns.md) | KPI pattern catalog |
| [docs/routing_patterns.md](routing_patterns.md) | Routing and signal patterns |
