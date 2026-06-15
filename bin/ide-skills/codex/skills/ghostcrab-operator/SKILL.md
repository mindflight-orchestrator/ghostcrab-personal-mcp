---
name: ghostcrab-operator
description: Convert natural-language business or operations questions into deterministic GhostCrab MCP workflows on Personal SQLite workspaces. Use for status, review, risk analysis, or "what exists / what can answer this" when the user does not know projection, facet, or graph jargon.
---

# GhostCrab Operator (Personal)

Translate business intent into an MCP investigation. Product language first unless the user asks for internals.

References: [RUNTIME_QUERY_PIPELINE.md](../ghostcrab-shared/RUNTIME_QUERY_PIPELINE.md), [MCP_VS_GCP_ROUTING.md](../ghostcrab-shared/MCP_VS_GCP_ROUTING.md), [ARTIFACT_KINDS.md](../ghostcrab-shared/ARTIFACT_KINDS.md), [ENUM_BUSINESS_FACETS.md](../ghostcrab-shared/ENUM_BUSINESS_FACETS.md).

## Delivery context (optional)

When the user runs a starter-kit delivery project: resolve `{starterkit}` via [STARTERKIT_PATHS.md](../ghostcrab-shared/STARTERKIT_PATHS.md), then load `{starterkit}/personal-mcp/SOP_SEQUENCE.md` and [SKILL_ROUTE_MAP_ESSENTIALS.md](../ghostcrab-shared/SKILL_ROUTE_MAP_ESSENTIALS.md).

## Surface

- **MCP** for reads/writes: `ghostcrab_*` tools after `ghostcrab_status`, including `ghostcrab_ontology_import` for LinkML/N-Triples ontology source import.
- **CLI** for operator maintenance and high-throughput/offline imports: `gcp brain structured-import`, `gcp brain document`, `gcp brain ontology compile|import|export` — not for routine `search`/`remember` (MCP-only).

Do not use legacy Pro CLI tools, `DATABASE_URL`, or direct SQL.

## Workflow

1. `ghostcrab_status` — confirm workspace and SQLite health.
2. `ghostcrab_workspace_use` when switching workspace intentionally.
3. `ghostcrab_search` or `ghostcrab_combined_search` with the user question.
4. `ghostcrab_count` to shape the space when filters are unclear.
5. `ghostcrab_pack` for session working context (`analysis_plan` + top facts).
6. `ghostcrab_projection_get` when an `answer_snapshot` is relevant.
7. `ghostcrab_graph_search` / `ghostcrab_traverse` when dependencies or blockers matter.

## Answer structure

- What the user asked (plain language).
- What MCP returned (observed rows, counts).
- What is inferred vs missing.
- Recommended next MCP call or operator command (`gcp` only if MCP cannot do it).

## Guardrails

- `ghostcrab_pack` does not prove a full domain graph.
- LinkML ontologies (`ontology_*`) are separate from `ghostcrab:task` schemas — use ontology compile/import for formal taxonomies, `ghostcrab_schema_register` for agent facet schemas.
- For domain enum filters, use `<module>.<slot_snake_case>` facet keys — never bare slot names (see [ENUM_BUSINESS_FACETS.md](../ghostcrab-shared/ENUM_BUSINESS_FACETS.md)).
- If tools are configured but not visible in session, stay diagnostic; do not claim MCP validation.
