# Runtime query pipeline (Personal)

Use this order for business Q&A on a qualified workspace.

## Happy path

1. **`ghostcrab_status`** — workspace + MCP health.
2. **ghostcrab-operator** skill — shape the question; pick scope if known.
3. **`ghostcrab_search`** or **`ghostcrab_combined_search`** — facts + graph-linked facts.
4. **`ghostcrab_count`** — when filters or population shape is unclear.
5. **`ghostcrab_pack`** — active `analysis_plan` rows + top matching facts.
6. **`ghostcrab_projection_get`** — when a frozen `answer_snapshot` is in scope.
7. **`ghostcrab_graph_search`** / **`ghostcrab_traverse`** — dependencies, blockers, evidence paths.

## When evidence is thin

- **ghostcrab-evidence-discovery** — map question → facets, graph, projections, coverage.
- **ghostcrab-json-answer-builder** — honest JSON with `observed_data` vs `inferred_interpretation`.

## When the question is not answerable

- **ghostcrab-gap-auditor** — `answerability_gap` categories + actionable adjustments.
- Route graph invariant issues to **`ghostcrab_graph_diagnostics`** (not gap-auditor).
- Route ontology vocabulary holes to **`ghostcrab_coverage`**.

## Do not use for routine reads

- `gcp brain structured-import`, `gcp brain document`, `gcp brain ontology compile` — operator/CLI maintenance only. See [MCP_VS_GCP_ROUTING.md](MCP_VS_GCP_ROUTING.md).
