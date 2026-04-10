# Embeddings Runtime

This document explains the two execution rails used by GhostCrab for embeddings.

## Two Rails

GhostCrab intentionally separates deterministic development from real-provider validation.

- `fake-first` rail:
  - used by `npm run test`
  - used by `PG_PORT=55432 npm run verify:e2e`
  - never depends on network access
  - uses `disabled`, `null`, `fake`, or `fixture` providers only
- `real-provider` rail:
  - activated explicitly
  - used for local validation against OpenRouter
  - never required by the standard CI flow

## Configuration Precedence

Embeddings config is resolved in this order:

1. explicit environment variables
2. `config.yaml`
3. `.env`

Relevant inputs today:

- `GHOSTCRAB_EMBEDDINGS_MODE`
- `GHOSTCRAB_EMBEDDINGS_MODEL`
- `GHOSTCRAB_EMBEDDINGS_API_KEY`
- `GHOSTCRAB_EMBEDDINGS_BASE_URL`
- `GHOSTCRAB_EMBEDDING_DIMENSIONS`
- `GHOSTCRAB_EMBEDDINGS_TIMEOUT_MS`
- `GHOSTCRAB_HYBRID_BM25_WEIGHT`
- `GHOSTCRAB_HYBRID_VECTOR_WEIGHT`

The default local config file is [config.yaml](/Users/francois/Documents/mars2026/ghostcrab/config.yaml).

## Why `verify:e2e` Does Not Use The Real Provider

`verify:e2e` forces `GHOSTCRAB_EMBEDDINGS_MODE=disabled` unless you explicitly override it for a targeted command. This is deliberate:

- CI must stay deterministic
- no standard test should depend on API cost, quotas, or latency
- local failures in OpenRouter must not block basic repository validation

The standard E2E chain still validates embeddings behavior through:

- `smoke:mcp:embeddings-fake`

That rail checks:

- write path in `ghostcrab_remember`
- semantic mode in `ghostcrab_search`
- hybrid mode in `ghostcrab_search`
- hybrid fact ranking in `ghostcrab_pack`

## Real OpenRouter Validation

Once PostgreSQL is up and migrated, run:

```bash
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab npm run smoke:mcp:embeddings-real
```

The real smoke is opt-in and only runs if an OpenRouter key is available.

It validates:

- `ghostcrab_remember`
- `ghostcrab_search` in `semantic`
- `ghostcrab_search` in `hybrid`
- `ghostcrab_pack`
- `ghostcrab_status`

## Backfill Existing Rows

When the database already contains facts without vectors, use:

```bash
npm run embeddings:backfill -- --dry-run
npm run embeddings:backfill -- --batch-size 25 --limit 100
npm run embeddings:backfill -- --schema-id agent:observation
```

Behavior:

- only rows with `embedding IS NULL` are selected
- batching is sequential
- dry-run never calls the provider
- real writes require a provider with `writeEmbeddingsEnabled = true`

## Fallback Behavior

If the real provider fails:

- `ghostcrab_remember` stores the fact without blocking on vector generation
- `ghostcrab_search` falls back to BM25 and returns notes
- `ghostcrab_pack` falls back to BM25 fact ranking and returns notes
- `ghostcrab_status` exposes runtime failure metadata and recommended next actions

This keeps the public MCP surface honest even when embeddings are degraded.
