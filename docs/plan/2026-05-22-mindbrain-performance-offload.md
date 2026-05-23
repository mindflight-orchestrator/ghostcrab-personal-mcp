# MindBrain Performance Offload Plan

## Objective

Move the expensive parts of GhostCrab Personal retrieval, graph, embedding, and
workspace-model handling into the official sibling `../mindbrain` repository,
where performance-critical code can use Zig 0.16 and the native SQLite/search
indexes directly.

`vendor/mindbrain` in this repository is a pinned dependency surface. It must
not be edited locally. The correct flow is:

1. Implement and validate native changes in `../mindbrain`.
2. Expose stable HTTP/CLI/native contracts from MindBrain.
3. Update GhostCrab Personal wrappers and tests.
4. Sync or pin `vendor/mindbrain` from the validated sibling state.

## Repository Boundary

### `../mindbrain`

Owns fast, complex, volume-sensitive behavior:

- BM25, vector, hybrid, and semantic ranking.
- Top-k selection and score blending.
- Graph traversal, relation/property ingestion, and graph search.
- Workspace-model export and table/column/relation catalog scans when they need
  native access.
- Batch persistence primitives for semantics, relation properties, embeddings,
  and graph-derived rows.
- Benchmarks and native regression tests.

### `ghostcrab-personal-mcp`

Owns orchestration and product contracts:

- MCP tool schemas and response shapes.
- CLI wrappers.
- Session/workspace routing.
- Fallback behavior when native MindBrain is unavailable.
- Contract tests, smoke tests, and release packaging.

### `vendor/mindbrain`

Read-only for normal work in this repository:

- Do not patch this tree directly.
- Do not treat local vendor edits as authoritative.
- Only update it by syncing from the sibling `../mindbrain` commit that already
  passed validation.

## Current Native Surfaces To Reuse

The sibling already has relevant fast-path foundations:

- `src/standalone/hybrid_search.zig` implements native hybrid BM25/vector
  scoring with bounded top-k insertion.
- `src/standalone/vector_sqlite_exact.zig` exposes exact vector search against
  SQLite document/chunk vectors.
- `src/standalone/search_sqlite.zig` and `src/standalone/search_store.zig`
  back the native search document store.
- `src/standalone/graph_sqlite.zig` backs graph traversal and graph payload
  extraction.
- `src/standalone/workspace_sqlite.zig` already has workspace-model export
  structures and TOON export support.
- `src/standalone/http_app.zig` exposes GhostCrab-oriented HTTP routes,
  including search, graph search, projection retrieval, graph reindexing, and
  collection facet search.

The plan should prefer extending those surfaces over adding heavier TypeScript
logic in GhostCrab.

## Performance Targets

Use measurable targets per feature instead of vague "faster" goals:

- Hybrid search: avoid decoding thousands of embeddings in Node during normal
  operation; native route should return a bounded ranked pool.
- Semantic fallback: keep TypeScript fallback correct but not the default
  high-volume path.
- Batch writes: reduce `N` awaited SQL round trips to `1` or chunked batches for
  semantics and relation properties.
- Workspace export: reduce repeated table/column/relation scans to indexed
  lookups or a native export route.
- Graph search: keep relation/property expansion bounded and queryable from the
  native graph layer.

## Workstreams

### 1. Native Search Contract

Problem:

GhostCrab currently has a TypeScript semantic/hybrid fallback that can load a
large candidate pool, decode embedding blobs, score cosine similarity, and sort
in Node. This is acceptable as a fallback, but not as the preferred hot path.

MindBrain direction:

- Keep `hybrid_search.zig` as the canonical scorer.
- Ensure the HTTP route accepts workspace, query, optional embedding, weights,
  limit, and optional collection/table scope.
- Add any missing filter support needed by GhostCrab, especially schema/facet
  filters that currently happen after native search.
- Preserve deterministic ordering for equal scores.
- Add native benchmark coverage for realistic candidate counts.

GhostCrab direction:

- Prefer the native route whenever available.
- Keep the TypeScript path as a bounded fallback only.
- Add contract tests proving the MCP response shape is unchanged.

Acceptance:

- Native search returns the same fields GhostCrab needs: `doc_id`,
  `bm25_score`, `vector_score`, `combined_score`.
- GhostCrab no longer needs to decode broad embedding pools on the normal path.
- `tests/tools/facets-search-semantic.test.ts` and
  `tests/tools/combined-search.test.ts` pass.

### 2. Workspace Model Export Offload

Problem:

GhostCrab workspace export currently builds maps and validation data from
table/column/relation rows in TypeScript. The immediate code can be optimized
locally with maps, but if the export becomes large or shared, the native source
of truth should be `../mindbrain`.

MindBrain direction:

- Extend `workspace_sqlite.zig` export output to cover the GhostCrab public
  model fields needed by `ghostcrab_workspace_export_model`.
- Ensure table, column, relation, source mapping, primary key, nullability, and
  generation hints are computed from indexed native scans.
- Add a route or CLI command that can export by `workspace_id` and depth.

GhostCrab direction:

- First, add low-risk map precomputation if a local improvement is needed.
- Then replace heavy export assembly with a native call when the native contract
  is ready.
- Keep TS validation as contract-level sanity checks, not as the main expensive
  scanner.

Acceptance:

- Export output remains schema-compatible with existing tests.
- Large workspaces avoid repeated TypeScript full-list scans.
- `tests/tools/workspace-export.test.ts` and workspace model unit tests pass.

### 3. Semantic Proposal Batch Persist

Problem:

`persistSemanticProposal` does one awaited upsert per table, column, and
relation semantic. That is simple, but it scales as many database round trips.

MindBrain direction:

- Add native batch APIs for table semantics, column semantics, and relation
  semantics.
- Keep conflict keys and JSON metadata behavior identical.
- Support chunking for very large proposals.

GhostCrab direction:

- Route bulk semantic persistence through the native batch API when present.
- Keep the current per-row implementation as compatibility fallback.

Acceptance:

- Same counts and final rows as current behavior.
- Round trips are chunked instead of per item.
- CLI workspace semantic integration tests pass.

### 4. Graph Relation Property Batch Upsert

Problem:

Relation properties are currently upserted one at a time before mirroring into
the graph relation property table.

MindBrain direction:

- Add a native batch relation-property upsert that accepts one relation plus an
  array of typed properties.
- Preserve null handling, numeric/integer/text value fields, currency, and
  `ref_doc_id`.
- Keep graph mirror behavior in the same native transaction.

GhostCrab direction:

- Replace per-property loop with one native call once available.
- Keep relation/property response shape unchanged.

Acceptance:

- Existing relation property tests still pass.
- Batch call preserves conflict update behavior.
- Graph search relation expansion sees the same property rows.

### 5. Guidance Embedding Cache

Problem:

Modeling guidance can rebuild embeddings for static aliases and DB signal rows
on each request.

MindBrain direction:

- Store or expose cached embeddings for activity-family aliases and signal
  patterns.
- Key cache rows by stable signal id plus content hash/version.
- Provide an invalidation path for changed signal facts.

GhostCrab direction:

- Ask MindBrain for cached signal matches where available.
- Keep current in-process embedding behavior as fallback.

Acceptance:

- Repeated guidance calls avoid re-embedding unchanged static text.
- Output ranking remains stable enough for existing guidance tests.
- Cache invalidation is explicit and testable.

### 6. Graph Search And Expansion Bounds

Problem:

Graph search and combined search can expand entities into relations, linked
facts, and chunks. The current defaults are bounded, but high-volume graph work
should stay native.

MindBrain direction:

- Keep graph entity search and relation expansion in native routes.
- Add optional relation property and chunk evidence limits if missing.
- Ensure workspace and collection scoping happen inside the native query.

GhostCrab direction:

- Preserve `include_relations`, `include_chunks`, `limit`, `graph_limit`,
  `facet_limit`, and `chunk_limit` as MCP-level controls.
- Avoid unbounded post-processing after native graph results.

Acceptance:

- Combined search remains graph-first.
- Payload size is bounded by explicit limits.
- MCP schema contract tests cover defaults and max values.

## Implementation Phases

### Phase 0 - Baseline And Contracts

- Capture current GhostCrab tests for:
  - `tests/tools/facets-search-semantic.test.ts`
  - `tests/tools/combined-search.test.ts`
  - `tests/tools/dgraph.test.ts`
  - `tests/tools/workspace-export.test.ts`
  - relevant CLI workspace integration tests
- In `../mindbrain`, list current HTTP routes and native functions used by
  GhostCrab.
- Record before/after timings for at least one local dataset with search,
  export, and graph operations.

### Phase 1 - Native Search First

- Extend `../mindbrain` search route only where GhostCrab still has to do
  expensive work.
- Add Zig tests and a benchmark around hybrid search candidate sizes.
- Update GhostCrab search wrapper to prefer the native route.
- Keep bounded TypeScript fallback.

### Phase 2 - Batch Write Primitives

- Add native batch APIs for semantic proposal persistence and relation property
  upserts.
- Update GhostCrab wrappers to call batch APIs.
- Preserve old behavior as fallback while vendor versions transition.

### Phase 3 - Workspace Export Native Contract

- Decide whether a local map optimization is enough or whether the export
  should move fully into `../mindbrain`.
- If native export is chosen, expose a stable route and adapt
  `ghostcrab_workspace_export_model`.

### Phase 4 - Guidance Cache

- Add cached signal/alias embedding support in `../mindbrain`.
- Update GhostCrab guidance to use the native/cache layer when available.

### Phase 5 - Vendor Sync And Release

- Validate `../mindbrain`.
- Sync `vendor/mindbrain` from the validated sibling commit.
- Rebuild prebuilds if the native binary changed.
- Run GhostCrab typecheck, build, unit tests, and targeted MCP smoke tests.

## Validation Commands

From `../mindbrain`, use an explicit Zig 0.16 binary and writable caches:

```bash
ZIG_LOCAL_CACHE_DIR=/tmp/zig-cache \
ZIG_GLOBAL_CACHE_DIR=/tmp/zig-global-cache \
/usr/local/bin/zig-0.16 build test
```

If this machine uses a different Zig 0.16 path, verify with:

```bash
/usr/local/bin/zig-0.16 version
```

From `ghostcrab-personal-mcp`:

```bash
pnpm run typecheck
pnpm run build
pnpm test
```

Targeted GhostCrab checks:

```bash
pnpm test -- tests/tools/facets-search-semantic.test.ts
pnpm test -- tests/tools/combined-search.test.ts
pnpm test -- tests/tools/dgraph.test.ts
pnpm test -- tests/tools/workspace-export.test.ts
```

## Risks

- Native and TypeScript ranking can drift if score normalization differs.
- Moving filters into native search can change edge cases around facet arrays,
  schema filtering, null handling, or workspace scoping.
- Batch writes can accidentally change conflict behavior or update ordering.
- Cached guidance embeddings need explicit invalidation, otherwise stale signal
  matches become hard to diagnose.
- Syncing `vendor/mindbrain` before validating the sibling can hide whether a
  failure belongs to MindBrain or GhostCrab.

## Done Criteria

- No direct local edits in `vendor/mindbrain`.
- Each native performance change lands first in `../mindbrain`.
- GhostCrab wrappers preserve public MCP/CLI contracts.
- Fallbacks remain bounded and correct.
- The relevant Zig and TypeScript tests pass.
- Benchmarks or timings show the targeted hot path improved.
