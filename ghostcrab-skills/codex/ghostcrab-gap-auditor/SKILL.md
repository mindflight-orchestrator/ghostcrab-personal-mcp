---
name: ghostcrab-gap-auditor
description: Audit gaps between a natural-language GhostCrab question and evidence available through MCP on a SQLite workspace. Use when a projection is missing, a Type A contract exists without evidence, required facets or graph edges are not verified, a Type B snapshot is absent, an MCP tool fails, or the user asks what to add to make an operational answer reliable.
---

# GhostCrab Gap Auditor (Personal)

## Purpose

Explain why a business question is not fully answerable yet and propose concrete adjustments. Keep declared capability separate from observed evidence.

Use **MCP tool output** as evidence. Do not open SQLite directly. Do not use legacy Pro operators (PostgreSQL CLI) or direct SQL.

References: [glossary](../../../docs/explanation/glossary.md), [operator catalog](../../../docs/reference/operator-catalog.md), [non-artifact gaps (backend)](../../../vendor/mindbrain/docs/artifacts/non-artifact-gaps-and-reports.md).

## Vocabulary boundary

Gap categories below are **`answerability_gap`** findings. They are **not** `artifact_kind` values and must not be stored in `mindbrain_answer_artifacts`.

| This skill | Not this |
|------------|----------|
| `answerability_gap` (audit result) | `graph_gap_rule` (persisted validation rule) |
| `missing_snapshot` subtype | `answer_snapshot` (frozen answer artifact) |
| `no_projection` subtype | `analysis_plan` (working-memory artifact) |
| `missing_edges` subtype | `graph_data_gap` from `ghostcrab_graph_diagnostics` |
| Contradictory graph facts | `graph_conflict` (planned; not `answerability_gap`) |

For graph invariant violations, point operators to `ghostcrab_graph_diagnostics` and `graph_gap_rules`. For incompatible facts (mutually exclusive, temporal, granularity), see `vendor/mindbrain/docs/graphs/graph-conflict-taxonomy.md`. For ontology coverage, use `ghostcrab_coverage`.

## Gap categories

All categories are subtypes of **`answerability_gap`**:

- `no_projection`: no matching analysis plan / Type A scope for the question.
- `projection_contract_only`: Type A / `analysis_plan` exists in `projections` but no supporting facts or graph rows surfaced.
- `missing_dimensions`: expected business dimensions absent or unclear.
- `missing_facets`: required facet filters or `agent_facts` rows missing.
- `missing_edges`: required graph edges absent or not traversed.
- `missing_snapshot`: no Type B / `answer_snapshot` via `ghostcrab_projection_get`.
- `tool_surface_gap`: needed MCP tool missing or failed.
- `ambiguous_intent`: multiple scopes match; narrow with the user.

## Audit workflow

1. `ghostcrab_status` — workspace and health.
2. `ghostcrab_workspace_use` if workspace unclear.
3. `ghostcrab_search` / `ghostcrab_combined_search` with the user question.
4. `ghostcrab_schema_inspect` / `ghostcrab_schema_list` for expected shapes.
5. `ghostcrab_pack` or `ghostcrab_projection_get` when answer artifacts matter.
6. `ghostcrab_graph_search` / `ghostcrab_traverse` when graph evidence is required.
7. Compare results to the user question.

For import pipeline gaps, point operators to `gcp brain structured-import`; for ontology source gaps, prefer MCP `ghostcrab_ontology_import` when an agent owns the workflow, or `gcp brain ontology compile` for CLI/operator maintenance — see product runbooks.

## Output format

```json
{
  "workspace_id": "",
  "question": "",
  "gap_status": "",
  "matched_projection": null,
  "gaps": [],
  "adjustments": [],
  "mcp_tools_used": [],
  "recommended_next_test": ""
}
```

Each gap entry: `category` (answerability subtype above), `severity` (`low|medium|high`), `evidence`, `impact`. Do **not** emit `artifact_kind` on gap entries.

Adjustments must be actionable: register schema, `ghostcrab_remember`/`learn`, LinkML compile, structured-import gate, or consumer test.

## Guardrails

- Do not label a projection ready if only the Type A / `analysis_plan` contract exists and the user asked for live operational facts.
- Type B / `answer_snapshot` is optional; state when Type A + graph search is enough.
- Prefer `recommended_next_test` over vague advice.
- Never conflate gap audit output with answer artifact registry rows.
