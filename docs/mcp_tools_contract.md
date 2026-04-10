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

- `schema_id` selects one logical record family in `mfo_facets`.
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
