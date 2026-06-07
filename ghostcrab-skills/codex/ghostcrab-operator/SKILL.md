---
name: ghostcrab-operator
description: Convert natural-language business or operations questions into deterministic GhostCrab MCP workflows on Personal SQLite workspaces. Use for status, review, risk analysis, or "what exists / what can answer this" when the user does not know projection, facet, or graph jargon.
---

# GhostCrab Operator (Personal)

Translate business intent into an MCP investigation. Product language first unless the user asks for internals.

## Surface

- **MCP** for reads/writes: `ghostcrab_*` tools after `ghostcrab_status`, including `ghostcrab_ontology_import` for LinkML/N-Triples ontology source import.
- **CLI** for operator maintenance and high-throughput/offline imports: `gcp brain structured-import`, `gcp brain document`, `gcp brain ontology compile|import|export` — not for routine `search`/`remember` (MCP-only).

Do not use legacy Pro CLI tools, `DATABASE_URL`, or direct SQL.

## Workflow

1. `ghostcrab_status` — confirm workspace and SQLite health.
2. `ghostcrab_workspace_use` when switching workspace intentionally.
3. `ghostcrab_search` or `ghostcrab_combined_search` with the user question.
4. `ghostcrab_count` to shape the space when filters are unclear.
5. `ghostcrab_pack` for session working context (Type A projections + top facts).
6. `ghostcrab_projection_get` when a materialized report (Type B) is relevant.
7. `ghostcrab_graph_search` / `ghostcrab_traverse` when dependencies or blockers matter.

## Answer structure

- What the user asked (plain language).
- What MCP returned (observed rows, counts).
- What is inferred vs missing.
- Recommended next MCP call or operator command (`gcp` only if MCP cannot do it).

## Guardrails

- Type A `ghostcrab_pack` does not prove a full domain graph.
- LinkML ontologies (`ontology_*`) are separate from `ghostcrab:task` schemas — see [ontology README](../../../docs/explanation/ontology/README.md).
- If tools are configured but not visible in session, stay diagnostic; do not claim MCP validation.
