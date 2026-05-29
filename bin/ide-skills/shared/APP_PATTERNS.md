# Shared App Patterns

**First-turn fuzzy onboarding and hard gate:** [ONBOARDING_CONTRACT.md](./ONBOARDING_CONTRACT.md).

These patterns describe how client integrations should use GhostCrab at runtime.

## Persona Rule

Talk about the user's work first, not GhostCrab internals.
Do not expose schemas, facets, graph edges, or MCP tool names on a first fuzzy onboarding turn unless the user explicitly asks how GhostCrab works internally.

## First-Turn Fuzzy Onboarding

If the user mentions GhostCrab and the request is still fuzzy:

1. do not start with `ghostcrab_status`
2. do not start with `ghostcrab_schema_list`
3. do not register schemas
4. do not write records
5. do not propose local files or alternate storage
6. reply with:
   - one short intent hypothesis
   - 2 to 4 clarification questions
   - one likely compact-view recommendation
   - one explicit prompt-help offer

## Session Start

At session start:

1. call `ghostcrab_status` only when runtime health, autonomy, or global blockers may materially affect the answer
2. if the task domain is new and the user is past intake, read the closest `ghostcrab:activity-family`, `ghostcrab:modeling-recipe`, and `ghostcrab:projection-recipe`
3. load a small fact slice with `ghostcrab_search`
4. if the task is non-trivial and at least one factual read already happened, call `ghostcrab_pack`

## Write-Back Discipline

Write back durable knowledge when you discover:

- architectural decisions
- stable conventions
- important blockers
- recurring failure modes
- durable domain facts

Do not write back:

- transient scratch thoughts
- duplicate summaries of already stored facts
- speculative conclusions without evidence

## Gap Handling

If `ghostcrab_coverage` or `ghostcrab_status` indicates a gap:

- continue only if the task allows disclosed uncertainty
- otherwise escalate with the specific gap or blocker called out

## Projection Pattern

Prefer dynamic projections over static long-lived prompt files.

The client file should describe the method.
The live KPIs, blockers, and next-step context should come from GhostCrab via factual reads and compact projections.

## Long-Running Discipline

For long-running delivery, integration, CRM, deployment, or research work:

1. end each meaningful session with a checkpoint
2. end each phase boundary with a checkpoint
3. before overwriting a meaningful current-state record, preserve transition rationale when losing it would harm recovery

Use [shared/TRANSITION_LOGGING.md](./TRANSITION_LOGGING.md) as the baseline pattern.

## Demo Profile Pattern

A portable demo profile should include:

- a minimal factual layer
- a minimal graph layer
- a minimal operational pack layer

The goal is not realism at all costs. The goal is to let the user immediately ask meaningful questions and watch the agent reason over a small but coherent dataset.

Across demo profiles, favor a simple progression:

1. facts that can be searched and counted
2. graph structure that can be traversed
3. one projection that demonstrates compact working context
