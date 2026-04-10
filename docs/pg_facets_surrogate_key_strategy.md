# pg_facets registration and surrogate keys

## Problem

GhostCrab stores facet rows in `mfo_facets` with a **UUID** primary key (`id`). The `pg_facets` extension’s registration API (`facets.add_faceting_to_table`) expects a **surrogate integer** primary key on the target table so bitmap structures can key documents by `int8`.

Until a compatible surrogate exists, **native search/count paths cannot register `mfo_facets`**, and tools correctly stay on portable SQL.

## Options (spike)

1. **Add `doc_id bigint` surrogate** (generated identity or sequence), keep UUID `id` as logical key; register `pg_facets` on `(doc_id)` and maintain a stable mapping `id` ↔ `doc_id` in application code or triggers.
2. **Separate native table** owned by `pg_facets` with integer PK, synced from `mfo_facets` (ETL or triggers) — higher operational cost.
3. **Defer native routing** until product chooses 1 or 2; keep materialized JSONB columns (migration `006`) as preparation only.

## Recommendation

Prefer **option 1** for a single source of truth: one row per facet document, integer surrogate for extension indexing, UUID preserved for MCP and API stability.

## References

- [docs/ROADMAP-V2.md](ROADMAP-V2.md) — progress checklist and Phase 6 PR-6.1.
- Migration `006_facets_materialized_pg_facets.sql` — generated columns for common facet keys.
