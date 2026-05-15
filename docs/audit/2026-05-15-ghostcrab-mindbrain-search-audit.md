# GhostCrab MindBrain search audit

Date: 2026-05-15

GhostCrab checkout verified: `v0.2.22`

Vendored MindBrain verified: `vendor/mindbrain` is pinned to `v1.2.1`
(`caa691cdd5d3722ab28f3a574826071104495c4d`).

## Executive summary

The alarming external report is partially correct for the active GhostCrab MCP
surface, even though it is not correct for the current vendored MindBrain core.

GhostCrab currently vendors MindBrain `v1.2.1`, which contains SQLite FTS5 BM25
and exact vector-search primitives. However, the agent-facing
`ghostcrab_search` tool does not call those MindBrain search primitives. It
queries the `facets` table directly through HTTP SQL and scores text with
`instr(lower(content), lower(?))`.

Embeddings can be generated and stored by `ghostcrab_remember` /
`ghostcrab_upsert`, but the main `ghostcrab_search` read path does not use them.
It returns `semantic_available: false` and maps requested `semantic` mode back to
`bm25`. The active `ghostcrab_pack` facts path also uses the same substring
matching style.

So the accurate conclusion is:

- MindBrain core is not the blocker: the vendored engine has the newer search
  primitives.
- GhostCrab's current MCP search facade is still a SQL fallback over `facets`.
- Product/docs/smoke expectations around semantic retrieval are ahead of the
  active implementation.

## Claim-by-claim assessment

| External claim | GhostCrab current assessment | Evidence |
| --- | --- | --- |
| Embeddings are generated and stored. | True when embeddings mode is `fake`, `fixture`, or `openrouter`. | `ghostcrab_remember` and `ghostcrab_upsert` call `context.embeddings.embedMany(...)` and write `embedding_blob`. |
| Embeddings are used by `ghostcrab_search`. | False. | `src/tools/facets/search.ts` never reads `embedding_blob`, never embeds the query, and always returns `semantic_available: false`. |
| `"BM25"` is actually `instr(...)` SQL. | True for `ghostcrab_search` and SQL facts packing. | `src/tools/facets/search.ts` and `src/tools/pragma/pack.ts` build `instr(lower(content), lower(?)) > 0` clauses. |
| Semantic search in SQLite is disabled by design. | True for GhostCrab's active MCP `ghostcrab_search` surface; false for vendored MindBrain core. | `search.ts` maps requested semantic mode to `mode_applied: "bm25"` and reports `semantic_available: false`; `vendor/mindbrain` itself contains FTS5/vector search support. |
| Embeddings are only used in guidance-style scoring. | Mostly true for read-time semantics outside write paths. | `src/tools/pragma/guidance.ts` has an on-the-fly embedding similarity layer for activity-family scoring, separate from persisted fact retrieval. |

## Code evidence

- `src/tools/facets/search.ts`
  - Accepts `mode: "hybrid" | "bm25" | "semantic"`.
  - For non-empty queries, splits terms and adds
    `instr(lower(content), lower(?)) > 0` predicates.
  - Sets `modeApplied = input.mode === "semantic" ? "bm25" : input.mode`.
  - Returns `semantic_available: false` and `backend: "sql"`.
- `src/tools/pragma/pack.ts`
  - Retrieves facts with the same `instr(lower(content), lower(?))` pattern.
  - Reports `facts_mode_applied: "bm25"` even though this is SQL substring
    scoring, not FTS5 BM25.
- `src/tools/facets/remember.ts`
  - Generates embeddings when `writeEmbeddingsEnabled` is true.
  - Stores the value in `facets.embedding_blob`.
- `src/tools/facets/upsert.ts`
  - Regenerates embeddings only when content changes and embeddings are
    writable.
  - Clears `embedding_blob` on content changes when embeddings are unavailable,
    avoiding stale semantic state.
- `src/cli/embeddings-backfill.ts`
  - Intended to backfill missing embeddings, but it still queries/updates
    `embedding`, while the active write path uses `embedding_blob`. This is a
    concrete naming bug to fix before relying on the backfill CLI.
- `src/tools/pragma/status.ts`
  - Hard-codes `sqlite_readiness.facets.bm25 = false`.
  - Correctly reports embeddings status from runtime config, but not an actual
    search integration.
- `vendor/mindbrain`
  - Is pinned to `v1.2.1`, the same core version audited separately.
  - The vendor DDL contains the newer `search_fts`, `search_embeddings`,
    `documents_raw_vector`, and `chunks_raw_vector` surfaces.

## Test evidence

Targeted deterministic tests were run:

```bash
pnpm exec vitest run \
  tests/tools/facets.test.ts \
  tests/tools/pragma.test.ts \
  tests/unit/embeddings.test.ts \
  tests/unit/embeddings-backfill.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests  32 passed (32)
```

Important interpretation: these tests pass because they currently encode the
fallback behavior. For example, `tests/tools/facets.test.ts` has a test named
`searches with BM25 fallback when semantic mode is requested`, and expects
`mode_applied: "bm25"` plus `semantic_available: false`.

There is also contradictory smoke-test evidence:

- `scripts/mcp-smoke-embeddings-fake.mjs` expects `mode_applied: "semantic"`
  and `semantic_available: true`.
- `scripts/mcp-smoke-embeddings-real.mjs` expects the same behavior with
  OpenRouter embeddings.

Those smoke expectations do not match the current `search.ts` implementation.
They should be treated as failing/stale acceptance criteria until the search
surface is wired to persisted vector retrieval.

## Risk rating

P0 for product truthfulness:

- The agent-facing `ghostcrab_search` mode names imply BM25/semantic behavior
  that is not implemented in the active path.
- Stored embeddings can create a false sense of semantic retrieval if users only
  inspect write responses such as `embedding_stored: true`.
- Smoke scripts and README/config language can overstate current capability.

P1 for functionality:

- Search quality is limited to substring-like lexical matching over `facets`.
- The vendored MindBrain search engine is available but not used by the MCP
  search tool.
- Backfill uses the wrong column name (`embedding` instead of `embedding_blob`),
  so operational embedding repair is unsafe until corrected.

## Recommended fixes

1. Fix truthful reporting immediately.
   - Rename `mode_applied: "bm25"` to a more precise value such as
     `"keyword_sql"` or `"substring_sql"` until the path actually calls FTS5
     BM25.
   - Keep `semantic_available: false` unless query embeddings and persisted
     embedding comparison are really executed.
   - Update smoke tests or mark them as expected failing acceptance criteria.

2. Wire real lexical search.
   - Prefer using MindBrain's SQLite FTS5 search surfaces instead of local
     `instr(...)` scoring.
   - Ensure `ghostcrab_status.runtime.sqlite_readiness.facets.bm25` reports the
     actual wired capability, not the existence of vendored code alone.

3. Wire persisted semantic search.
   - Standardize the embedding column/storage contract: `embedding_blob` as used
     by `remember`/`upsert`, or migrate cleanly to MindBrain search/vector
     tables.
   - For `mode: "semantic"`, embed the query and search persisted embeddings.
   - For `mode: "hybrid"`, combine FTS5 BM25 score and vector similarity using
     the configured retrieval weights.

4. Fix the backfill CLI before using it.
   - Replace `embedding IS NULL` / `SET embedding = ...` with the active column
     contract, or migrate to MindBrain-native vector tables.
   - Add a regression test that fails if the backfill updates a non-existent or
     stale embedding column.

5. Add end-to-end acceptance tests.
   - Fake embeddings mode: remember two facts, query semantic intent, verify
     the semantically matching row wins even without substring overlap.
   - BM25 mode: verify the query uses FTS5/BM25 or reports fallback truthfully.
   - Hybrid mode: verify both lexical and vector scores contribute to ranking.
