---
name: ghostcrab-projection-reviewer
description: Review GhostCrab projections and explain purpose, readiness, required dimensions, facets, edges, and limits. Use for projection scope review, Type A contracts, Type B snapshots, or readiness on a Personal workspace.
---

# GhostCrab Projection Reviewer (Personal)

Review projections for readers who may not know GhostCrab internals.

## Types (Personal SQLite)

| Type | Storage | Tools |
|------|---------|-------|
| **A — Working memory** | table `projections` | `ghostcrab_project`, `ghostcrab_pack` |
| **B — Materialized** | `graph_entity` as `ProjectionResult` | `ghostcrab_projection_get` |

Graph live queries are **not** projections — use `ghostcrab_graph_search`, `ghostcrab_traverse`.

See [05-projections](../../../docs/explanation/05-projections-expliquees.md).

## Workflow

1. `ghostcrab_status`.
2. `ghostcrab_pack` for active Type A scopes and fact highlights.
3. `ghostcrab_projection_get` when Type B or calculated snapshots are in scope.
4. `ghostcrab_search` / `ghostcrab_graph_search` to test whether declared requirements have evidence.

## Review sections

- Business purpose of the scope.
- Type A contract vs observed pack rows.
- Type B snapshot status (if applicable).
- Required facets/edges vs MCP evidence.
- What MCP proved / did not prove.
- Limits (stale pack if graph changed; pack ≠ graph viewer ready).

## Guardrails

- MCP only — no legacy Pro CLI, no SQL shortcuts.
- `status: active` on Type A is runtime projection state, not audit "materialized" language unless Type B exists.
