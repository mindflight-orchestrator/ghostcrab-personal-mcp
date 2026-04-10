# Known Limits

These limits are current and intentional for phase 4.

## Product Limits

- semantic vector search is not active yet
- the product graph is intentionally partial
- `ghostcrab_pack` relies on seeded projections plus BM25 facts, not a richer planner
- the example client covers stdio only

## Build Limits

- Zig is not pinned yet
- PostgreSQL native extension build versions are not pinned yet
- `pg_config` is not part of the default local path

## API Limits

- some clients may only handle legacy `tool_execution_error`; the server also emits `validation_error`, `database_error`, and `embedding_error` when classifiable
- `surface_version` is stable but not semantically versioned yet
- no multi-tenant auth or remote deployment contract is defined yet

## Operational Limits

- Docker fallback is the tested path
- the seed data is optimized for demo and product comprehension, not for production data volume
- projections and agent state are bootstrap defaults, not a full autonomous agent loop
