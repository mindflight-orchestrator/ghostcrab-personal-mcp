---
name: ghostcrab-json-answer-builder
description: Build stable JSON answers from GhostCrab MCP outputs for Personal workspaces. Use when the user wants JSON, API-ready payloads, or structured answers separating observed data, inference, missing evidence, and MCP tools used.
---

# GhostCrab JSON Answer Builder (Personal)

Convert MCP tool outputs into honest JSON.

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

## Guardrails

- Use `mcp_tools_used` only (legacy JSON field names from Pro CLI are deprecated).
- Cite [glossary](../../../docs/explanation/glossary.md) terms when explaining layers to the user.
