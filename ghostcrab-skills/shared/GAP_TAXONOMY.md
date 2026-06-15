# Gap taxonomy (Personal)

Separate **answerability** from **graph quality** from **answer artifacts**.

## Answer artifacts (`artifact_kind`)

`analysis_plan`, `live_answer_view`, `answer_snapshot`, `evidence_pack` — see [ARTIFACT_KINDS.md](ARTIFACT_KINDS.md).

## Gap senses (not `artifact_kind`)

| Code | Meaning | Tool / surface |
| --- | --- | --- |
| `answerability_gap` | Question not fully answerable yet | `ghostcrab-gap-auditor` skill |
| `graph_data_gap` | Missing rule, evidence, topology, typing | `ghostcrab_graph_diagnostics` |
| `graph_conflict` | Incompatible active facts (planned diagnostics) | diagnostics + `graph_knowledge_patch` |
| `graph_gap_rule` | Declared closed-world validation rule | `graph_gap_rules` table |
| `coverage_gap` | Ontology node not instantiated | `ghostcrab_coverage` |

## `answerability_gap` subtypes (gap-auditor)

- `no_projection` — no matching `analysis_plan` scope
- `projection_contract_only` — contract exists, no supporting facts/graph
- `missing_dimensions` — business dimensions absent or unclear
- `missing_facets` — required facet rows or filters missing; also when a business enum is referenced without the `<module>.<slot_snake_case>` prefix (check via `ghostcrab_facet_inspect` — see [ENUM_BUSINESS_FACETS.md](ENUM_BUSINESS_FACETS.md))
- `missing_edges` — required graph edges absent
- `missing_snapshot` — no `answer_snapshot` when user expected frozen report
- `tool_surface_gap` — MCP tool missing or failed
- `ambiguous_intent` — multiple scopes match; narrow with user

## Routing

- Invariant violations → `ghostcrab_graph_diagnostics`, not gap-auditor JSON
- Contradictory facts → graph conflict workflow (not `answerability_gap`)
- Import pipeline gaps → `gcp brain structured-import` + gate table in [IMPORT_CLOSURE_GATES.md](IMPORT_CLOSURE_GATES.md)
