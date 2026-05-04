# MCP Tool Description Patches For V1

**Behavioral context:** [shared/ONBOARDING_CONTRACT.md](shared/ONBOARDING_CONTRACT.md) (first-turn fuzzy gate, writes, discovery).

These patches are drafts for the public GhostCrab MCP tool descriptions.

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

## `ghostcrab_status`

- Use only when runtime health, autonomy, or global blockers may materially affect the answer.
- Do not call by default on first-turn fuzzy GhostCrab onboarding.
- Do not surface backend-health commentary unless it changes the user-visible answer.
