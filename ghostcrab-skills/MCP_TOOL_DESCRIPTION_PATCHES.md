# MCP Tool Description Patches For V1

**Behavioral context:** [shared/ONBOARDING_CONTRACT.md](shared/ONBOARDING_CONTRACT.md) (first-turn fuzzy gate, writes, discovery).

These patches are drafts for the public GhostCrab MCP tool descriptions.

## `ghostcrab_projections_list`

- Read-only catalogue: answer-artifact registry rows (`analysis_plan`, `live_answer_view`, `answer_snapshot`) plus optional graph `projection_id` values from `ProjectionResult`.
- Call when the user asks what projections exist or before `artifact_get` / `projection_get` / `pack` when ids are unknown.
- Output entries include `public_label` (user-facing), `artifact_id`, `projection_id`, and `suggested_tools` for the next MCP call.
- Does not return projection payload, pack rows, or graph evidence — follow `suggested_tools`.
- Full guide: `docs/reference/projections-discovery.md`.

## `ghostcrab_search`

- Prefer explicit `schema_id` and exact filters before broad free-text search.
- One zero-result exact read does not prove the whole domain is empty.
- On a first-turn fuzzy GhostCrab onboarding request, do not use this tool for broad surface exploration unless the user explicitly asked about available models or schema inventory.

## `ghostcrab_project`

- Use for provisional compact views, heartbeat projections, and working scopes only after the user request is clear enough to model.
- Do not initialize a provisional scope on the first fuzzy onboarding turn.
- Prefer one compact projection over many overlapping projections.

## `ghostcrab_remember`

- Use for durable facts, stable notes, and supporting evidence.
- Do not use on a first-turn fuzzy onboarding request.
- Summarize before storing; do not use raw payloads as the durable artifact when a stable summary will do.

## `ghostcrab_upsert`

- Use for current-state changes that should stay unique in place.
- Before replacing a meaningful tracker state, preserve the transition rationale when losing it would hurt recovery.
- Do not use on a first-turn fuzzy onboarding request.
- **`match` shape (required):** use `match.id` (row UUID) and/or `match.facets` (object). Facet selectors must live **under** `match.facets`, not at the root of `match`. Wrong: `{"match":{"label":"Deal A"}}`. Right: `{"match":{"facets":{"label":"Deal A"}}}`. Prefer a stable `record_id` (or similar) inside `match.facets` over labels that may change.
- When `create_if_missing` is true and no row matches, **`set_content` is required** (body text for the new row).

## `ghostcrab_learn`

- Use for durable structural relations such as blockers, dependencies, or conceptual links.
- Do not create graph structure before the user intent is clarified on the first fuzzy onboarding turn.

## `ghostcrab_schema_register`

- This is a freeze-level action.
- Never call it on a first-turn fuzzy onboarding request.
- Only register a canonical or custom schema after a confirmed modeling gap and explicit user confirmation.
- Do not use it to import LinkML/N-Triples ontology source files; use `ghostcrab_ontology_import` for native `ontology_*`.

## `ghostcrab_ontology_import`

- Use for LinkML YAML or OWL/RDF N-Triples source import into native MindBrain `ontology_*` tables.
- Do not replace it with `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_schema_register`, or `ghostcrab_graph_gap_rules_import`; those tools write memory, graph instances, agent schemas, or diagnostic rules.
- Keep `materialize_graph` false unless importing N-Triples should also create graph instances.

## `ghostcrab_status`

- Use only when runtime health, autonomy, or global blockers may materially affect the answer.
- Do not call by default on first-turn fuzzy GhostCrab onboarding.
- Do not surface backend-health commentary unless it changes the user-visible answer.
