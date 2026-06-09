---
name: ghostcrab-json-answer-builder
description: Build stable JSON answers from GhostCrab MCP outputs for Personal workspaces. Use when the user wants JSON, API-ready payloads, or structured answers separating observed data, inference, missing evidence, and MCP tools used.
---

# GhostCrab JSON Answer Builder (Personal)

Convert MCP tool outputs into honest JSON.

References: [ARTIFACT_KINDS.md](../../shared/ARTIFACT_KINDS.md), [GAP_TAXONOMY.md](../../shared/GAP_TAXONOMY.md), [RUNTIME_QUERY_PIPELINE.md](../../shared/RUNTIME_QUERY_PIPELINE.md).

## Delivery context (optional)

Runtime Q&A tail of `starterkit/personal-mcp/SOP_SEQUENCE.md` — after operator and evidence-discovery.

## Template

```json
{
  "workspace_id": "",
  "question": "",
  "answer_status": "complete|partial|unsupported",
  "observed_data": {},
  "inferred_interpretation": {},
  "missing_evidence": [],
  "unsupported_claims": [],
  "mcp_tools_used": [],
  "recommended_next_tools": []
}
```

## Rules

- `observed_data`: only values returned by MCP tools in this session.
- `inferred_interpretation`: label clearly; never merge into `observed_data`.
- `mcp_tools_used`: tool names and key arguments.
- Do not treat `required_facets` from a projection contract as proof rows unless search/pack returned matching facts.

## Layer vocabulary (when explaining to the user)

- **Facets** — `agent_facts` rows (`ghostcrab_search`)
- **Graph** — `graph_entity` / `graph_relation` (`ghostcrab_graph_search`, `ghostcrab_traverse`)
- **Analysis plan** — `analysis_plan` via `ghostcrab_pack`
- **Snapshot** — `answer_snapshot` via `ghostcrab_projection_get`

See [ARTIFACT_KINDS.md](../../shared/ARTIFACT_KINDS.md) for the full table.

## Guardrails

- Use `mcp_tools_used` only (legacy Pro CLI JSON field names are deprecated).
- Route `unsupported` answers to `ghostcrab-gap-auditor` for structured gap JSON.
