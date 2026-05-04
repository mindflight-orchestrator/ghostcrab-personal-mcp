# GhostCrab SQLite To MindBrain Parity Adaptation Guide

This document summarizes:

1. the recent SQLite parity changes already implemented across `mindbrain` and this repository (`ghostcrab-personal-mcp`)
2. the target contract implied by the attached parity plan
3. the concrete code adaptations that this repository (`ghostcrab-personal-mcp`) still needs in order to converge on the adapted `pg_mindbrain` model

It is intended to pair with maintainer-local parity planning notes (not committed under `.cursor/` in this repository).

## Goal

Treat `mindbrain` as the SQLite implementation of the adapted `pg_mindbrain` contract.

That means:

- SQLite mode should not behave like a separate product line
- GhostCrab should expose the same public semantics in PostgreSQL mode and SQLite mode wherever the engine permits it
- remaining legacy `memory_*` behavior in `mindbrain` should be treated as implementation drift or compatibility baggage, not as the desired long-term contract

## Source Of Truth

For this work, the source of truth is:

- the adapted `pg_mindbrain` design
- the parity plan attached by the user

For **overlapping Layer 2 DDL** (`public.facets`, `public.projections`, optional `geo_entities` / `embedding_vectors`), the canonical contract is [`src/db/migrations/001_mindbrain_baseline.sql`](../src/db/migrations/001_mindbrain_baseline.sql). The MindBrain bundled install script [`vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql`](../vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql) is kept aligned with that baseline (PART 16B and post-seed Layer 2 blocks). Despite the filename, that file is **PostgreSQL** DDL; the `pg_mindbrain` shared library still supplies C symbols.

SQLite bootstraps additionally embed [`vendor/mindbrain/src/standalone/seed_bm25_stopwords.sql`](../vendor/mindbrain/src/standalone/seed_bm25_stopwords.sql) (generated from `vendor/mindbrain/sql/stopwords/`). That seed is **not** mirrored in `001_mindbrain_baseline.sql` today; native PostgreSQL parity for table-backed stopwords lives in the extension SQL (`facets.bm25_stopwords` and related functions in the bundled script).

Notably, this means:

- `mindbrain` should move toward the durable `mindbrain_*` semantics
- `ghostcrab-personal-mcp` (this repo) should rely on MindBrain-backed surfaces that implement those semantics
- any current local code that still centers `memory_*` should be considered transitional

## Recent Implemented Changes

The following changes were implemented during the latest parity pass.

### 1. SQLite status now reflects real MindBrain-backed capabilities

File:

- `src/tools/pragma/status.ts`

Before:

- the SQLite branch reported nearly all native capability/readiness flags as `false`
- GhostCrab effectively claimed that SQLite lacked traversal, ontology availability, and native pack support, even though MindBrain already exposed those capabilities over HTTP

Now:

- `runtime.native_readiness.pragma.pack` is `true`
- `runtime.native_readiness.dgraph.entityNeighborhood` is `true`
- `runtime.native_readiness.ontology.available`, `resolveWorkspace`, `coverageByDomain`, and `exportModel` are `true`
- `runtime.capabilities.graph_native_traversal` is `true`
- `runtime.capabilities.pragma_native_pack` is `true`
- `runtime.capabilities.mb_ontology_available` is `true`
- `runtime.backends.graph` is `"native"`
- `runtime.backends.pragma` is `"native"`

What this means:

- GhostCrab now reports the SQLite runtime more honestly
- agents can make better routing decisions in SQLite mode
- status output is closer to the real MindBrain-backed contract

### 2. MindBrain now exposes a GhostCrab-oriented projection pack endpoint

Files:

- `src/standalone/ontology_sqlite.zig`
- `src/standalone/http_server.zig`

Added:

- `ontology_sqlite.materializePackProjections(...)`
- HTTP route: `GET /api/mindbrain/ghostcrab/pack-projections`

Purpose:

- provide a MindBrain-owned pack projection surface backed by durable `projections`
- avoid forcing GhostCrab SQLite mode to keep its own divergent projection-pack semantics
- move parity logic toward MindBrain, which is the preferred direction from the plan

Current behavior of this route:

- filters `projections` by `agent_id`
- keeps `active` and `blocking` projections
- respects nullable scope with the same high-level GhostCrab behavior
- filters by query text
- sorts constraints first, then by descending weight, then by stable id

This is not yet perfect parity with the final target contract, but it is a concrete step away from the legacy `memory_projections`-centered pack path.

### 3. GhostCrab SQLite pack now prefers the new MindBrain-backed projection pack route

Files:

- `src/db/standalone-mindbrain.ts`
- `src/tools/pragma/pack.ts`

Added:

- `runStandaloneGhostcrabPack(...)` client helper in `standalone-mindbrain.ts`

Changed:

- SQLite `ghostcrab_pack` now calls MindBrain `GET /api/mindbrain/ghostcrab/pack-projections` first
- if that endpoint is unavailable, GhostCrab falls back to the previous SQL projection query path

Why this matters:

- SQLite pack semantics are now centered in MindBrain rather than being permanently duplicated inside GhostCrab
- rollout stays safe because older backend binaries still work through fallback

### 4. Targeted tests were updated to match the new SQLite parity surface

Files:

- `tests/tools/pragma.test.ts`

Updated coverage:

- SQLite capability reporting is explicitly tested
- SQLite pack now exercises the MindBrain-backed route in tests
- stale expectations were updated to match current SQLite output structure

Validation that was run:

- `npx vitest run tests/tools/pragma.test.ts` in `../`ghostcrab-personal-mcp` (this repo)`
- `zig build test` in `mindbrain`

## What Changed In The Effective Contract

These recent modifications imply the following contract changes for `../`ghostcrab-personal-mcp` (this repo)`.

### Status contract

GhostCrab SQLite code should now assume:

- SQLite mode has a native-pack concept, but it is MindBrain-backed rather than PostgreSQL-extension-backed
- SQLite mode has graph traversal capability through MindBrain HTTP
- SQLite mode has ontology/export/coverage capability through MindBrain HTTP

Any GhostCrab code or tests still assuming SQLite status is mostly-disabled should be updated.

### Pack contract

GhostCrab SQLite code should now assume:

- the preferred projection pack source is MindBrain, not ad hoc local SQL in GhostCrab
- the durable projection source should move toward `projections`
- GhostCrab can still use SQL fallback during transition, but that is no longer the preferred path

## How `../`ghostcrab-personal-mcp` (this repo)` Should Adapt Its Code

This section translates the parity plan into concrete adaptation work for the GhostCrab SQLite repo.

### A. Accept MindBrain as the owner of SQLite runtime semantics

Files already reflecting this direction:

- `src/db/standalone-mindbrain.ts`
- `src/tools/dgraph/traverse.ts`
- `src/tools/dgraph/coverage.ts`
- `src/tools/pragma/pack.ts`

Required adaptation rule:

- when a MindBrain HTTP surface exists for a parity-sensitive feature, GhostCrab should prefer it over maintaining a separate SQLite-only semantic implementation

This rule should guide future changes for:

- pack
- marketplace
- subgraph
- possibly facet-tree and native counting if those become HTTP-exposed from MindBrain

### B. Continue removing SQLite-specific semantic drift from `ghostcrab_pack`

Current state:

- projection retrieval now prefers MindBrain
- facts retrieval still happens in GhostCrab from `facets`
- SQLite branch still does not populate activity-family recipe enrichment, projection recipes, or KPI snapshots the way the PostgreSQL branch does

Files:

- `src/tools/pragma/pack.ts`
- `src/standalone/ontology_sqlite.zig`
- `src/standalone/http_server.zig`

Recommended next step:

1. decide whether pack enrichment should also migrate into MindBrain
2. if yes, expose a richer MindBrain endpoint that returns:
   - projections
   - matching facts
   - detected activity family
   - projection recipe
   - KPI snapshots
3. reduce GhostCrab SQLite pack to an orchestration/formatting layer rather than a semantic implementation layer

Why:

- otherwise GhostCrab still owns too much SQLite-specific pack behavior
- pack will remain only partially parity-aligned even though projection retrieval improved

### C. Update tests and expectations that still encode the old SQLite story

Any tests that still assume:

- `graph_native_traversal: false`
- `pragma_native_pack: false`
- `mb_ontology_available: false`
- SQLite always uses SQL-only pack semantics

should be updated.

Primary file already touched:

- `tests/tools/pragma.test.ts`

Additional places worth reviewing:

- `tests/integration/cli/native-readiness.test.ts`
- `tests/integration/mcp/server-contract.test.ts`
- any CLI golden-path tests that assert exact status/runtime payloads

### D. Keep SQL fallback only as a rollout bridge

Current code:

- `src/tools/pragma/pack.ts`

The fallback is correct for compatibility, but should be treated as transitional.

Recommended rule:

- if the MindBrain endpoint is available, GhostCrab should use it
- if the endpoint is missing, GhostCrab may fall back
- once the endpoint is stable and deployed everywhere, remove the fallback to eliminate semantic duplication

### E. Prepare for future MindBrain-owned HTTP surfaces

The plan still identifies missing or incomplete parity areas:

- marketplace search
- subgraph streaming parity in the GhostCrab embedded backend
- facet tree / native counting over `facets`
- DDL validation
- closer workspace export parity

For each of those, GhostCrab SQLite should adapt by:

1. consuming a MindBrain HTTP surface if one exists
2. only implementing local fallback if absolutely required
3. avoiding permanent SQLite-only semantics in GhostCrab when MindBrain should own them

## Remaining Gaps Against The Plan

The recent changes do not complete the plan. They advance it in two areas only:

- truthful SQLite capability reporting
- converging projection-pack semantics toward MindBrain-owned `projections`

The following gaps remain open.

### 1. MindBrain still has dual-model storage

Files:

- `src/standalone/sqlite_schema.zig`
- `src/standalone/pragma_sqlite.zig`

Problem:

- SQLite still exposes both `mindbrain_*` and `memory_*`
- `pragma_sqlite` still treats `memory_projections` / `memory_edges` as canonical for legacy pragma behavior

Implication for GhostCrab:

- GhostCrab must still be careful about which backend surface it is using
- not all SQLite semantics are yet centered on the durable `mindbrain_*` model

### 2. `ghostcrab_pack` still has split ownership

Current split:

- projections: increasingly MindBrain-owned
- facts and enrichment: still mostly GhostCrab-owned in SQLite mode

This is improved, but not finished.

### 3. Facet parity is still incomplete

Files:

- `src/tools/facets/count.ts`
- `src/tools/facets/search.ts`
- `src/tools/facets/hierarchy.ts`
- `src/standalone/search_sqlite.zig`
- `src/standalone/http_server.zig`

Problem:

- native faceting on `facets` is still not exposed the same way as `pg_mindbrain`
- GhostCrab SQLite still relies heavily on direct SQL over `facets`
- `ghostcrab_facet_tree` still lacks a real SQLite parity path

### 4. Marketplace and subgraph parity remain unfinished

Files:

- `src/tools/dgraph/marketplace.ts`
- `cmd/backend/http_server.zig`
- `src/standalone/http_server.zig`

Problem:

- MindBrain has marketplace logic in SQLite internals, but GhostCrab SQLite mode does not yet consume it
- GhostCrab embedded backend still does not mirror the `graph/subgraph` route

### 5. DDL validation parity is still missing

Files:

- `src/standalone/workspace_sqlite.zig`
- surrounding standalone workspace modules

Problem:

- PostgreSQL has `mb_ontology.validate_ddl_proposal`
- no equivalent standalone SQLite surface has been implemented yet

## Recommended Adaptation Sequence For `../`ghostcrab-personal-mcp` (this repo)`

If the goal is to adapt GhostCrab in the least divergent way, the recommended sequence is:

1. **Consume MindBrain-owned parity endpoints first**
   - already started for projection pack
   - continue for marketplace, subgraph, and any future facet/tree endpoints

2. **Reduce SQLite-specific semantic logic in GhostCrab**
   - keep GhostCrab as an API/MCP orchestration layer
   - push parity-sensitive semantics into MindBrain where possible

3. **Retire transitional fallback paths**
   - once backend rollout is stable, remove SQL fallbacks that preserve the older divergent behavior

4. **Update integration tests to assert the new contract**
   - status
   - pack
   - traversal
   - workspace export
   - coverage

5. **Document any remaining true engine limitations explicitly**
   - only differences that genuinely arise from SQLite/PostgreSQL engine constraints should remain documented as exceptions

## Immediate Follow-Up Candidates

The next concrete work items most aligned with the plan are:

1. move pack enrichment and fact retrieval behind a MindBrain-owned SQLite surface
2. add a MindBrain marketplace HTTP route and switch `ghostcrab_marketplace` in SQLite mode to use it
3. mirror `/api/mindbrain/graph/subgraph` into the GhostCrab embedded backend
4. start converging `pragma_sqlite` away from `memory_*` toward `mindbrain_*`

## Summary

The latest changes did not complete parity, but they established the correct direction:

- MindBrain now owns more of the SQLite pack contract
- GhostCrab status now describes the actual SQLite runtime instead of an artificially crippled one
- the preferred adaptation strategy for `../`ghostcrab-personal-mcp` (this repo)` is now clearer:
  consume MindBrain parity surfaces, reduce local SQLite-only semantics, and keep aligning the public GhostCrab behavior with the adapted `pg_mindbrain` contract
