# Shared Query Patterns

**Onboarding and tool-call gates:** [ONBOARDING_CONTRACT.md](./ONBOARDING_CONTRACT.md).

These query patterns are shared across clients.

## Read Levels

Use a simple escalation ladder:

1. `ghostcrab_search`
   - retrieve explicit facts when the entity type is recognizable
2. `ghostcrab_count`
   - shape the space when it is still broad
3. `ghostcrab_pack`
   - compress active context only after at least one factual read

When the activity domain is new:

1. call `ghostcrab_status` only if runtime health, autonomy, or global blockers may matter
2. inspect `ghostcrab:activity-family`
3. inspect `ghostcrab:modeling-recipe`
4. inspect `ghostcrab:projection-recipe`
5. inspect `ghostcrab:kpi-pattern`

For a first-turn fuzzy GhostCrab onboarding request:

1. do not call `ghostcrab_status` by default
2. do not call `ghostcrab_schema_list`
3. do not call `ghostcrab_schema_register`
4. ask the clarification questions first unless the user explicitly asked about runtime or available surfaces
5. if one compact-view recommendation is already visible, recommend it without initializing anything

## When To Use Graph Tools

- use `ghostcrab_coverage` before acting in partially known domains
- use `ghostcrab_traverse` to inspect blockers, dependencies, and gaps
- use `ghostcrab_learn` after discovering a stable structural relation

## Default Retrieval Habits

- count first when the domain may be broad
- search first when the user asked a concrete question
- pack first when the task is complex, multi-step, or risky
- status first only when operating constraints may matter
- for repeated workflows, read the recipe layer before inventing a new model
- never treat one exact zero-result read as proof that the whole domain is empty

## Honest Operation

If the graph or memory is incomplete:

- prefer `proceed_with_disclosure` over false confidence
- expose specific gap nodes when available
- record newly learned facts before ending the session

For out-of-domain requests in V1:

- do not force a fake family fit just to appear complete
- do not invent a schema family on the first fuzzy turn
- say honestly that the domain exceeds current V1 coverage if needed
- still help the user start with a simple framing prompt if the request remains trackable in plain language

## Demo Query Ideas

- compliance:
  - count obligations by `status` and `criticality`
  - search for critical gaps
  - traverse `REQUIRES` paths from blocked obligations
- project-management:
  - count tasks by `status`
  - pack the current sprint
  - traverse blockers from a delivery milestone
- incident-response:
  - search recent incident facts
  - pack the active response scope
  - traverse impacted services and dependencies
- software-delivery:
  - count PRs by `status`
  - search release blockers
  - pack the current release scope
- crm:
  - count opportunities by `stage`
  - search blocked outreach items
  - pack the current pipeline view
- knowledge-base:
  - search notes by `topic`
  - traverse related concepts
  - pack the current research scope
