---
name: ghostcrab-evidence-discovery
description: Discover which GhostCrab dimensions, facets, graph edges, projections, and evidence paths can support a natural-language answer via MCP. Use when a projection contract is not enough, when the user asks what data exists, or how to move from a business question to evidence-backed JSON.
---

# GhostCrab Evidence Discovery (Personal)

Map a business question to MCP surfaces that can answer it on SQLite Personal.

References: [RUNTIME_QUERY_PIPELINE.md](../../shared/RUNTIME_QUERY_PIPELINE.md), [ARTIFACT_KINDS.md](../../shared/ARTIFACT_KINDS.md), [projections-discovery.md](../../../docs/reference/projections-discovery.md).

## Delivery context (optional)

`starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP_SEQUENCE.md` — Phase B runtime section.

## Workflow

1. `ghostcrab_status` + active workspace.
2. `ghostcrab_projections_list` when projection ids or scopes are unknown.
3. `ghostcrab_search` / `ghostcrab_count` on `agent_facts`.
4. `ghostcrab_combined_search` when graph-linked facts may matter.
5. `ghostcrab_schema_list` / `ghostcrab_schema_inspect` for registered `ghostcrab:*` shapes.
6. `ghostcrab_pack` for active `analysis_plan` projections.
7. `ghostcrab_graph_search` / `ghostcrab_traverse` for graph paths.
8. `ghostcrab_coverage` for schema population overview.

Formal ontology dimensions (LinkML) live in `ontology_*` — discover via `gcp brain document qualification-vocab-list` after `ghostcrab_ontology_import` or CLI compile, not via `schema_register`.

## Output shape

```json
{
  "question": "",
  "workspace_id": "",
  "evidence_paths": [],
  "pack_context": null,
  "graph_context": null,
  "projection_scopes": [],
  "gaps": [],
  "mcp_tools_used": []
}
```

Gap labels: `no_facts`, `no_graph_path`, `projection_only`, `ontology_vocab_missing`, `tool_gap`.

## Guardrails

- Do not claim traversal without `ghostcrab_traverse` or `ghostcrab_graph_search` results.
- Route persistent tool failures to `ghostcrab-gap-auditor`.
- Personal SQLite only — no Pro PostgreSQL stack.
