# MCP Tools Contract

This document defines the public MCP surface exposed by GhostCrab in phase 4.

## Stable Response Envelope

All successful `ghostcrab_*` tool calls return JSON with the same additive envelope:

```json
{
  "ok": true,
  "tool": "ghostcrab_search",
  "surface_version": "2026-03-23",
  "generated_at": "2026-03-23T08:00:00.000Z"
}
```

Tool-specific fields are added next to this envelope, not nested under another key.

Structured tool errors return the same envelope with `error.code` set from the table below (message text is preserved).

```json
{
  "ok": false,
  "tool": "ghostcrab_search",
  "surface_version": "2026-03-23",
  "generated_at": "2026-03-23T08:00:00.000Z",
  "error": {
    "code": "validation_error",
    "message": "..."
  }
}
```

## Tool Matrix

| Tool | Primary use | Key outputs |
| --- | --- | --- |
| `ghostcrab_search` | retrieve stored facts and repo records | `returned`, `results`, `mode_applied`, `embedding_runtime`, `hybrid_weights`, `notes` |
| `ghostcrab_remember` | store a new observation or document | `stored`, `id`, `created_at`, `schema_id`, `embedding_stored`, `embedding_runtime`, `notes` |
| `ghostcrab_upsert` | update a current-state fact in place or create it when explicitly allowed | `updated`, `created`, `matched_existing`, `id`, `version`, `embedding_stored`, `notes` |
| `ghostcrab_count` | inspect shape before fetching content | `counts`, `schema_id`, `filters` |
| `ghostcrab_schema_register` | register a new schema definition | `registered`, `id`, `schema_id` |
| `ghostcrab_schema_list` | list known schemas | `target`, `schemas` |
| `ghostcrab_schema_inspect` | inspect one schema by `schema_id` | `found`, `schema`, `meta` |
| `ghostcrab_coverage` | decide whether a domain is sufficiently covered | `coverage_score`, `gap_nodes`, `recommended_action` |
| `ghostcrab_traverse` | inspect dependencies, blockers, and paths | `path`, `node_count`, `gap_candidates` |
| `ghostcrab_learn` | upsert graph nodes and edges | `node`, `edge` |
| `ghostcrab_pack` | build a compact working context | `pack`, `facts`, `pack_text`, `recommended_next_step`, `facts_mode_applied`, `embedding_runtime`, `hybrid_weights`, `notes` |
| `ghostcrab_project` | write or refresh a provisional projection | `stored`, `projection_id`, `scope`, `provisional`, `source_type`, `updated` |
| `ghostcrab_status` | get an operational and epistemic snapshot | `summary`, `directives`, `next_actions`, `runtime` |

## Workflow Mapping

| Workflow | Tools |
| --- | --- |
| Capture and retrieve a fact | `ghostcrab_remember` -> `ghostcrab_search` -> `ghostcrab_count` |
| Update a current-state record without duplicates | `ghostcrab_upsert` -> `ghostcrab_search` -> `ghostcrab_count` |
| Inspect product graph gaps | `ghostcrab_coverage` -> `ghostcrab_traverse` -> `ghostcrab_status` |
| Prepare working context before execution | `ghostcrab_pack` -> `ghostcrab_status` |
| Create a provisional working projection | `ghostcrab_project` -> `ghostcrab_pack` -> `ghostcrab_status` |
| Design a new data shape | `ghostcrab_schema_list` -> `ghostcrab_schema_inspect` -> `ghostcrab_schema_register` |

## Input Conventions

- `schema_id` selects one logical record family in `facets`.
- `filters` are exact JSONB matches, with arrays treated as `OR`.
- `edge_labels` narrow `ghostcrab_traverse` without changing direction semantics.
- `agent_id` defaults to `agent:self` for status, coverage, and pack-oriented workflows.

## Output Conventions

- `recommended_action` in `ghostcrab_coverage` is one of:
  - `proceed`
  - `proceed_with_disclosure`
  - `escalate`
- `gap_candidates` in `ghostcrab_traverse` expose concept nodes with `mastery <= 0`.
- `recommended_next_step` in `ghostcrab_pack` is one of:
  - `resolve_constraints_first`
  - `reason_with_pack`
  - `gather_more_facts`
- `embedding_runtime` is always additive runtime metadata; it may report a configured provider even when the current request fell back to BM25.
- `semantic_available` in `ghostcrab_search` reflects semantic availability for the current request, not only static configuration.
- `hybrid_weights` exposes the effective BM25/vector blend used by the request.
- `next_actions` in `ghostcrab_status` is the flattened action list derived from `directives`.
- `routing_policy` in `ghostcrab_status` exposes seeded intents, signals, and ingest hints for fuzzy user requests.

## Known Error Codes

- `unknown_tool` — tool name not in the registry (wrapper).
- `validation_error` — Zod validation failed on tool arguments.
- `database_error` — PostgreSQL driver error (SQLSTATE-style `code` on the underlying error).
- `embedding_error` — `EmbeddingProviderError` from the embeddings layer.
- `tool_execution_error` — any other handler or internal failure.

Those errors are emitted by the MCP server wrapper or tool handlers. Older clients may only have handled `unknown_tool` and `tool_execution_error`; new codes are additive for better self-correction.


## Exact fact records and single-record deletion

`ghostcrab_record_get` requires `workspace_id`, `schema_id` and an exact opaque
`id` returned by remember/upsert. It returns `found` and `row` (content, facets,
version and validity); an absent or differently scoped row returns `found:false`.
This read does not depend on ranked-search limits.

`ghostcrab_upsert` accepts optional `expected_version`. When provided, the
selected version must match before any archive or mutation; otherwise the
response is `version_conflict`. Existing callers retain their prior behavior.
Business clients should always send the version returned by record_get.

`ghostcrab_record_delete` requires the same exact scope plus positive
`expected_version`. The native `/api/mindbrain/facts/delete` endpoint removes
one row and its BM25/FTS/vector artifacts in one transaction. Closed history
rows remain historical records. No schema, ontology, workspace or registration
is changed. Wrong scope and repeat deletion return `deleted:false`; a stale
version returns `version_conflict`. The Operator host must enforce identity,
application access and schema/field authorization before invoking these APIs.
# Existing application graph records

`ghostcrab_graph_record_get/create/update/delete` operate on existing business
graph types in an exact `workspace_id` and `node_type`. They never call `learn`
and never create or edit ontology/workspace definitions.

All return `node: {id,node_type,label,properties,version}` when a row is present.
The returned `id` is a decimal entity ID string. `version` is an opaque stable
SHA256 fingerprint of this public content; callers must read it before editing
or deleting. Structural metadata keys are excluded from `properties`.

- Get takes `{workspace_id,node_type,id}` and returns `found` plus `node|null`.
- Create takes `{workspace_id,node_type,id,label,properties}`. Its input `id` is
  a new opaque external ID; it returns the allocated decimal ID. Reusing an
  existing external ID fails `id_exists`. The type must already be represented
  in that workspace's raw/runtime graph or declared by its existing ontology.
- Update takes `{workspace_id,node_type,id,expected_version,label?,properties}`.
  Properties are merged and hidden/structural metadata is preserved. A stale
  fingerprint fails `version_conflict` before any write.
- Delete takes `{workspace_id,node_type,id,expected_version}` and returns
  `deleted`. It removes this exact raw/runtime entity, its incident own-workspace
  relations and links, then reconciles own-workspace adjacency/degree indices.
  A relation owned by another workspace prevents deletion (`foreign_relation`).

Writes require native explicit SQL sessions with `BEGIN IMMEDIATE`; there is no
non-transactional fallback. The session ID accompanies each sequential SQL call
and the native writer rejects other writers while this session owns the lane.
SQL remains implementation code inside MCP tools and is never a model argument.

The native bounded helper `POST /api/mindbrain/graph/business-adjacency` accepts
only `{workspace_id}` and rebuilds adjacency/degree indices from existing graph
relations. It does not replay raw data or erase the workspace's diagnostic
history. Successful deletion includes this index reconciliation; a transport
failure must not be reported as verified success by an application caller.
