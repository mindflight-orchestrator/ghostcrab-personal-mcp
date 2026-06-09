---
name: ghostcrab-projection-reviewer
description: Review GhostCrab projections and explain purpose, readiness, required dimensions, facets, edges, and limits. Use for projection scope review, Type A contracts, Type B snapshots, or readiness on a Personal workspace.
---

# GhostCrab Projection Reviewer (Personal)

Review projections for readers who may not know GhostCrab internals.

References: [ARTIFACT_KINDS.md](../ghostcrab-shared/ARTIFACT_KINDS.md), [IMPORT_CLOSURE_GATES.md](../ghostcrab-shared/IMPORT_CLOSURE_GATES.md).

## Delivery context (optional)

Starter-kit Phase B1: `starterkit/personal-mcp/ROUTE_MAP.md` § projections and `README_projection_tools.md`.

## Types (Personal SQLite)

| Label | `artifact_kind` | Storage | Tools |
| --- | --- | --- | --- |
| Working memory | `analysis_plan` | table `projections` | `ghostcrab_project`, `ghostcrab_pack` |
| Frozen report | `answer_snapshot` | `graph_entity` (`ProjectionResult`) | `ghostcrab_projection_get` |
| Live view | `live_answer_view` | `mindbrain_answer_artifacts` | `gcp brain artifact refresh` |

Graph live queries are **not** projections — use `ghostcrab_graph_search`, `ghostcrab_traverse`.

## Workflow

1. `ghostcrab_status`.
2. `ghostcrab_pack` for active `analysis_plan` scopes and fact highlights.
3. `ghostcrab_projection_get` when `answer_snapshot` or calculated bundles are in scope.
4. `ghostcrab_search` / `ghostcrab_graph_search` to test whether declared requirements have evidence.

## Review sections

- Business purpose of the scope.
- `analysis_plan` contract vs observed pack rows.
- `answer_snapshot` status (if applicable).
- Required facets/edges vs MCP evidence.
- What MCP proved / did not prove.
- Limits (stale pack if graph changed; pack ≠ graph viewer ready).

## Guardrails

- MCP only — no legacy Pro CLI, no SQL shortcuts.
- `status: active` on Type A is runtime projection state, not audit "materialized" language unless `answer_snapshot` exists.
