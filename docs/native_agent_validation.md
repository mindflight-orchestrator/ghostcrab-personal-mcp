# Native Agent Validation Runbook

This document is the canonical runbook for validating GhostCrab on the native
PostgreSQL stack with `pg_facets`, `pg_dgraph`, and `pg_pragma`, then replaying
the same scenarios across Codex, Claude Code, and OpenClaw.

## Goals

- Prove the native Docker image boots with all three extensions installed.
- Prove GhostCrab migrations, maintenance commands, and MCP tools work on that
  image end-to-end.
- Use one deterministic dataset and one scenario pack for all agent clients.
- Separate extension validation, tool validation, and agent validation.

## Audit Snapshot

Current truth after the V2 audit hardening:

- `tests/unit/` and `tests/tools/` are the primary guardrails for mocked and
  semi-real behavior.
- `tests/integration/cli/parity-native.test.ts` is the parity gate for
  `sql-only` vs `auto` behavior and ignores volatile routing/telemetry fields.
- `.github/workflows/docker-build.yml` proves the native image builds and now
  also runs GhostCrab bootstrap + integration tests against the built image.
- `.github/workflows/test-node.yml` still keeps vanilla-Postgres integration
  jobs to validate SQL-first behavior and fallback routing.

## Canonical Native Test Project

Use the repository itself as the test project and the native Docker path as the
reference runtime.

### Bootstrap

From the repository root:

```bash
docker compose -f docker/docker-compose.native.yml build
docker compose -f docker/docker-compose.native.yml up -d
docker exec ghostcrab_postgres_native psql -U postgres -d postgres -c \
  "SELECT extname FROM pg_extension WHERE extname IN ('pg_facets','pg_dgraph','pg_pragma') ORDER BY extname"

npm ci
npm run build
npm run migrate
npm run demo:load
node dist/index.js maintenance bootstrap-native
```

### Capture This Metadata

- Node version
- Docker version
- image name or tag
- output of `SELECT extname FROM pg_extension`
- output of `node dist/index.js maintenance bootstrap-native`
- output of `node dist/index.js status --agent-id agent:self`

## Validation Layers

### Layer 1 — Extension primitives

Validate directly with SQL or maintenance commands.

`pg_facets`

- `CREATE EXTENSION pg_facets`
- `register-pg-facets`
- `merge-facet-deltas`
- `facets.get_facet_counts`
- `facets.bm25_search`
- `facets.hierarchical_facets`

`pg_dgraph`

- `CREATE EXTENSION pg_dgraph`
- `graph.entity_neighborhood`
- `graph.marketplace_search`
- patch primitive used by `ghostcrab_patch`

`pg_pragma`

- `CREATE EXTENSION pg_pragma`
- `pragma_pack_context`

### Layer 2 — GhostCrab tools

Run each tool in:

- `MFO_NATIVE_EXTENSIONS=sql-only`
- `MFO_NATIVE_EXTENSIONS=auto`
- `MFO_NATIVE_EXTENSIONS=native`

Core matrix:

- `ghostcrab_status`
- `ghostcrab_count`
- `ghostcrab_search --mode bm25`
- `ghostcrab_facet_tree`
- `ghostcrab_pack`
- `ghostcrab_traverse`
- `ghostcrab_marketplace`
- `ghostcrab_patch`

Rules:

- Compare business payloads, not volatile timestamps or routing metadata.
- `backend` may differ between `sql-only` and `auto`.
- `native` mode must fail fast if required extensions are absent.

### Layer 3 — Agent scenarios

Use the same prompts and same data across all clients.

## Shared Scenario Pack

### Scenario Family 1 — Facets Retrieval

Prompt examples:

- "Count tasks by status in `project:apollo`."
- "Find the tasks blocked by missing API token using BM25."
- "Show the facet tree for the current delivery scope."

Expected signals:

- agent chooses `ghostcrab_count`, `ghostcrab_search`, or `ghostcrab_facet_tree`
- agent notices `backend`
- agent can explain whether the result came from SQL or native path

### Scenario Family 2 — Graph Reasoning

Prompt examples:

- "Traverse the immediate neighborhood of the native extension build component."
- "Find relevant marketplace neighbors for GhostCrab."
- "Apply a knowledge patch and confirm the result."

Expected signals:

- correct choice between `ghostcrab_traverse`, `ghostcrab_marketplace`, and `ghostcrab_patch`
- awareness that multi-hop traversal can still fall back to SQL

### Scenario Family 3 — Pragma / Working Memory

Prompt examples:

- "Build a context pack for the current task."
- "Compare pack behavior with and without scope."
- "Explain whether the pack was produced through native pragma or fallback SQL."

Expected signals:

- use of `ghostcrab_pack`
- correct reading of `backend`
- correct explanation of scoped vs unscoped behavior

### Scenario Family 4 — Ops / Runtime Awareness

Prompt examples:

- "Tell me exactly which native extensions are loaded."
- "Tell me which native capabilities are actually available."
- "Run the required maintenance before querying the native indexes."

Expected signals:

- use of `ghostcrab_status`
- use of maintenance commands where appropriate
- distinction between `extensions_detected`, `capabilities`, and `backends`

## Agent Scoring Rubric

Record one sheet per scenario and per client:

- `Tool choice`: right tool selected first
- `Runtime awareness`: reads and interprets `ghostcrab_status` correctly
- `Native awareness`: understands capability vs backend vs fallback
- `Result quality`: output is correct and actionable
- `Recovery`: handles missing extension or fallback cleanly

Suggested grades: `pass`, `weak pass`, `fail`.

## Commands To Reuse Across Clients

These commands are good smoke anchors before agent runs:

```bash
node dist/index.js status --agent-id agent:self
node dist/index.js count --schema-id demo:test:task --group-by status --filters '{"scope":"project:apollo"}'
node dist/index.js search --query "missing API token" --schema-id demo:test:task --mode bm25
node dist/index.js pack --query "native extension build project delivery"
node dist/index.js maintenance bootstrap-native
```

## CI Relationship

- `test-node.yml` validates SQL-first behavior and routing on vanilla Postgres.
- `docker-build.yml` validates the built native image and runs GhostCrab against
  that image.
- Agent campaigns should start only after both are green.
