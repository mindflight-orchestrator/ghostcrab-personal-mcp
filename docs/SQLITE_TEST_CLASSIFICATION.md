# SQLite Test Classification

**Date:** 2026-04-09  
**Scope:** classify the existing `ghostcrab-sqlite-mcp` test suite into:

- `Keep`: reusable as-is for the SQLite migration
- `Adapt`: valuable, but currently coupled to PostgreSQL behavior or helpers
- `Postpone`: strongly PostgreSQL-native; keep out of the first SQLite validation loop

## 1. Summary

The repo already has a broad suite:

- unit tests
- tool-level tests
- integration CLI tests
- MCP integration tests
- end-to-end scenarios

The problem is not lack of tests. The problem is that many integration helpers and a meaningful subset of tool tests still assume:

- PostgreSQL schemas like `graph.*` and `mindbrain.workspaces`
- PostgreSQL operators and casts like `::jsonb`, `::uuid`, `CURRENT_DATE`, `now()`
- extension probes via `pg_extension`, `to_regclass`, `to_regprocedure`
- native functions like `mb_ontology.*`, `facets.*`, `graph.marketplace_search`, `pragma_pack_context`

## 2. Keep As-Is

These are immediately useful for the SQLite branch because they are mostly contract-level or pure logic tests.

### 2.1 Unit tests with low PostgreSQL coupling

- `tests/unit/cli-commands.test.ts`
- `tests/unit/cli-execute.test.ts`
- `tests/unit/cli-runner.test.ts`
- `tests/unit/dispatch.test.ts`
- `tests/unit/embeddings-backfill.test.ts`
- `tests/unit/embeddings.test.ts`
- `tests/unit/export-schema-validation.test.ts`
- `tests/unit/facet-types.test.ts`
- `tests/unit/registry.test.ts`
- `tests/unit/telemetry.test.ts`
- `tests/unit/workspace-model-contract.test.ts`
- `tests/unit/workspace-model.test.ts`

Why:

- mostly parser / registry / serialization / contract assertions
- little or no direct dependency on live PostgreSQL SQL

### 2.2 Tool contract tests that should still stay

- `tests/tools/mcp-schema-contract.test.ts`

Why:

- validates MCP schema surface rather than backend implementation

## 3. Adapt

These are the high-value tests for SQLite. They should not be dropped; they should be rewritten to use SQLite-aware helpers and expectations.

### 3.1 Config and server tests

- `tests/unit/env.test.ts`
- `tests/unit/server.test.ts`

Why adapt:

- they currently expect PostgreSQL defaults like `postgres://...`
- server tests assume PostgreSQL wording and startup behavior

Target:

- make them dual-backend
- assert `databaseKind=sqlite` paths and SQLite startup messages

### 3.2 DB helper tests

- `tests/unit/migrate.test.ts`
- `tests/unit/seed.test.ts`

Why adapt:

- the current migration/seed logic is still largely PostgreSQL-shaped
- SQLite branch now has lightweight schema init and partial bypass of PostgreSQL bootstrap

Target:

- split PostgreSQL migration tests from SQLite bootstrap/schema-init tests

### 3.3 Tool tests with backend-value but SQL-shape assumptions

- `tests/tools/facets.test.ts`
- `tests/tools/dgraph.test.ts`
- `tests/tools/pragma.test.ts`
- `tests/tools/workspace.test.ts`
- `tests/tools/workspace-export.test.ts`
- `tests/tools/geo.test.ts`
- `tests/tools/ddl.test.ts`

Why adapt:

- many assertions inspect exact SQL fragments like `bm25_vector`, `graph.entity`, `mb_ontology.export_workspace_model`, `graph.marketplace_search`
- some tests assert native extension routing instead of user-visible outcomes

Target:

- keep contract assertions on tool outputs
- replace SQL-fragment assertions with backend-aware result assertions
- split each file into:
  - backend-agnostic tests
  - SQLite-specific tests
  - PostgreSQL-native tests

### 3.4 Integration helpers

- `tests/helpers/cli-integration.ts`
- `tests/helpers/mcp-stdio.ts`

Why adapt:

- `cli-integration.ts` truncates PostgreSQL tables (`graph.relation`, `graph.entity`, etc.)
- it calls `runMigrations`, `ensureBootstrapData`, and `resolveExtensionCapabilities` with PostgreSQL assumptions
- `mcp-stdio.ts` passes `DATABASE_URL` into spawned processes

Target:

- create backend-aware helpers
- allow spawning with:
  - `GHOSTCRAB_DATABASE_KIND=sqlite`
  - `GHOSTCRAB_SQLITE_PATH=...`
  - `GHOSTCRAB_EMBEDDINGS_MODE=disabled|fixture`

### 3.5 CLI / MCP integration tests worth keeping after helper rewrite

- `tests/integration/mcp/server-contract.test.ts`
- `tests/integration/mcp/scenario-pack.test.ts`
- `tests/integration/mcp/server-traces.test.ts`
- `tests/integration/mcp/agent-comparison.test.ts`
- `tests/e2e/cli/workflows.test.ts`
- `tests/integration/cli/bootstrap.test.ts`
- `tests/integration/cli/edge-cases.test.ts`
- `tests/integration/cli/parity.test.ts`

Why adapt:

- these are exactly the tests that should prove the SQLite port preserves GhostCrab’s user-visible behavior
- but today they use PostgreSQL-native helpers and direct SQL inserts with `::jsonb`, `CURRENT_DATE`, etc.

Target:

- convert them into the main SQLite acceptance suite

## 4. Postpone

These tests are still strongly PostgreSQL-native. Keep them around, but do not make them blockers for the first SQLite milestone.

### 4.1 Native extension readiness and maintenance

- `tests/unit/extension-resolve.test.ts`
- `tests/unit/native-bootstrap.test.ts`
- `tests/unit/native-readiness.test.ts`
- `tests/unit/facets-maintenance.test.ts`
- `tests/unit/facets-registration.test.ts`
- `tests/unit/maintenance-cli.test.ts`
- `tests/integration/cli/native-readiness.test.ts`
- `tests/integration/cli/parity-native.test.ts`

Why postpone:

- tied directly to `pg_extension`, `pg_facets`, `pg_dgraph`, `pg_pragma`, `to_regclass`, `to_regprocedure`
- not relevant to validating the first standalone SQLite backend

### 4.2 Workspace DDL lifecycle on PostgreSQL

- `tests/integration/cli/v3-workspace-ddl.test.ts`
- `tests/integration/cli/workspace-semantics.test.ts`
- `tests/integration/cli/kanban-golden-path.test.ts`
- `tests/integration/cli/crm-outbound-golden-path.test.ts`

Why postpone:

- they rely on:
  - `mindbrain.workspaces`
  - approval/execution flows using PostgreSQL DDL
  - `to_regclass('public.table')`
  - trigger generation assumptions
- these are not yet represented by the current SQLite-first implementation

### 4.3 Live MCP E2E against external DB

- `tests/integration/e2e/casino-synth-pilot.test.ts`

Why postpone:

- explicitly guarded by `DATABASE_URL`
- built around a live external PostgreSQL-backed server flow

## 5. Recommended First SQLite Test Set

The first CI gate for the SQLite branch should be:

1. all `Keep` tests
2. adapted versions of:
   - `tests/e2e/cli/workflows.test.ts`
   - `tests/tools/facets.test.ts`
   - `tests/tools/pragma.test.ts`
   - `tests/tools/dgraph.test.ts`
   - `tests/integration/mcp/server-contract.test.ts`
   - `tests/integration/mcp/scenario-pack.test.ts`

That set would validate:

- tool registration and schema contract
- write/read/update memory workflows
- graph learn/traverse basics
- pragma/project/pack flows
- MCP server behavior over stdio

## 6. Immediate Refactor Queue

### 6.1 First helper split

Create backend-aware helpers for:

- database setup/reset
- seeded fixture loading
- spawned MCP process env

### 6.2 First SQL cleanup

Replace direct PostgreSQL-only test SQL in helpers:

- `TRUNCATE ... RESTART IDENTITY CASCADE`
- `::jsonb`
- `CURRENT_DATE - INTERVAL '1 day'`
- `now()`

with backend-specific reset/insert helpers.

### 6.3 First test files to migrate

1. `tests/e2e/cli/workflows.test.ts`
2. `tests/tools/facets.test.ts`
3. `tests/tools/pragma.test.ts`
4. `tests/tools/dgraph.test.ts`
5. `tests/integration/mcp/server-contract.test.ts`

These will give the highest confidence for the least migration effort.
