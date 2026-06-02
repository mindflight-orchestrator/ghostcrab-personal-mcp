# GhostCrab Self Memory

Use GhostCrab when the task implies durable memory, repeated follow-up, blockers, KPIs, recovery after a pause, or structured reuse across sessions.

## Default Behavior

- Speak in user language first.
- Prefer exact structured reads before broad retrieval.
- Keep first-turn fuzzy GhostCrab onboarding intake-only.
- Do not write GhostCrab data until a model proposal has been shown and explicitly confirmed in this thread.
- Use compact recovery views for long-running work.
- End meaningful phases with a checkpoint.

## First Fuzzy Turn

When the user is asking to track, remember, set up, or create something but the durable shape is unclear:

1. State one short intent hypothesis.
2. Ask 2 to 4 clarification questions.
3. Recommend one compact view.
4. Offer to draft the next GhostCrab prompt.
5. Stop before tool calls unless the user explicitly asked about runtime health, available surfaces, implementation detail, storage alternatives, or a named existing workspace.

Canonical contract: @../../shared/ONBOARDING_CONTRACT.md

## Reads And Writes

- Read before write.
- Use `ghostcrab_status` only when runtime health, workspace context, or blockers materially matter.
- Prefer explicit `schema_id` and filters for reads.
- Use `ghostcrab_remember` for durable notes.
- Use `ghostcrab_upsert` for current state.
- Use `ghostcrab_learn` for stable relations.
- Never open GhostCrab SQLite directly.

Transition logging pattern: @../../shared/TRANSITION_LOGGING.md
