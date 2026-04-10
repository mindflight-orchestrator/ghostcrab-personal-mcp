# Claude Code Calibration Pass 4

This note captures the next Claude Code calibration target after the cleaner isolated pass.

The goal is no longer just to reduce premature writes.

The goal is now to fix the remaining first-turn onboarding defects that still appear even when writes are delayed.

## Executive Summary

Claude has improved on:

- zero-write discipline
- reduced immediate bootstrap behavior

Claude is still failing on:

- `read-first`
- `schema-first`
- reopening the storage decision after the user already chose GhostCrab
- falling back to local files as a default working-memory substitute
- missing explicit prompt-help close
- missing compact-view recommendation

So Pass 4 focuses on one principle:

- first-turn GhostCrab onboarding must stay product-first, intake-first, and GhostCrab-committed

## Main Failure Modes To Eliminate

### 1. Read-First

Observed behavior:

- Claude still calls `ghostcrab_status`
- Claude still calls `ghostcrab_schema_list`
- Claude still inspects GhostCrab internals before the onboarding conversation is complete

Why this is a problem:

- it makes the first reply tool-led instead of user-led
- it pulls the model into implementation detail too early
- it increases the chance of schema exposition and setup-first behavior

Desired behavior:

- on a first-turn fuzzy GhostCrab request, Claude should reason from the user's need in plain language first

Pass 4 rule:

- `No surface introspection by default.`
- `Do not call ghostcrab_status or ghostcrab_schema_list on a first-turn fuzzy GhostCrab onboarding request unless the user explicitly asked about GhostCrab readiness, runtime state, or available GhostCrab surfaces.`

### 2. Schema-First

Observed behavior:

- Claude still explains schemas, tools, graph edges, record mappings, or retrieval facets too early

Why this is a problem:

- even without writes, the answer still stops feeling like onboarding
- it turns product help into internal system explanation

Desired behavior:

- first reply should stay in product language
- internal GhostCrab structure should appear only after clarification or explicit user request

Pass 4 rule:

- `No schema exposition in first reply.`
- `Do not enumerate schemas, tools, graph edges, record mappings, or facet strategies until the intake is complete or the user explicitly asks for implementation detail.`

### 3. Reopen Storage Choice

Observed behavior:

- Claude sometimes asks whether the user wants YAML, JSON, files, or GhostCrab even when the user already asked for GhostCrab

Why this is a problem:

- it reopens a decision that the user already made
- it breaks product alignment
- it makes GhostCrab feel optional when the user already chose it

Desired behavior:

- once the user said they want GhostCrab, that decision is fixed unless they explicitly ask for alternatives

Pass 4 rule:

- `No alternate persistence if GhostCrab was chosen.`
- `If the user already chose GhostCrab, do not reopen the storage decision.`
- `Do not propose YAML, JSON, Markdown files, local scratch files, or other persistence options unless the user explicitly asked for alternatives.`

### 4. File-First Fallback

Observed behavior:

- in some cases Claude falls back to proposing a local file as the working-memory structure

Why this is a problem:

- it bypasses the product
- it replaces GhostCrab with a parallel local memory system
- it weakens the intended durable-retrieval contract

Desired behavior:

- if the user wants GhostCrab onboarding, local files are not the default answer

Pass 4 rule:

- `No file-first fallback.`
- `On GhostCrab onboarding, do not propose a local file as the default memory surface or first implementation step.`
- `Only suggest a local file if the user explicitly asked for one or rejected GhostCrab-backed persistence.`

### 5. Prompt-Help Missing

Observed behavior:

- Claude still often forgets to say it can help write the next GhostCrab prompt

Why this is a problem:

- the flow feels like technical consulting, not product onboarding
- the user is left without the expected next-step scaffolding

Desired behavior:

- every first-turn fuzzy onboarding reply must end with prompt help

Pass 4 rule:

- `Mandatory prompt-help close.`
- `Every first-turn fuzzy GhostCrab onboarding reply must end with an explicit offer to draft the next structured GhostCrab prompt.`

Required examples:

- `Si tu veux, après tes réponses je peux te rédiger un prompt GhostCrab propre pour démarrer.`
- `Je peux aussi te proposer une version plus cadrée si tu veux éviter toute dérive dès le départ.`

### 6. Compact-View Recommendation Missing

Observed behavior:

- Claude does not consistently recommend the likely compact recovery view

Why this is a problem:

- the product contract is not only about memory shape
- it is also about helping the user see the smallest useful recovery view

Desired behavior:

- if the family is visible, Claude should mention the likely compact view
- it must stay a recommendation only

Pass 4 rule:

- `Compact-view recommendation is required when the route is visible.`
- `Mention the likely compact recovery view in one short line, but do not initialize it or create records for it.`

Examples:

- `Likely recovery view: mini-heartbeat.`
- `Likely recovery view: integration-health-brief.`
- `Likely recovery view: deployment-brief.`
- `Likely recovery view: knowledge-snapshot.`

## Full Pass 4 Prompt Cadrage

This is the full intended behavior for Sonnet 4.6 on first-turn fuzzy GhostCrab onboarding:

1. do not introspect GhostCrab surface by default
2. do not enumerate schemas, tools, edges, or mappings
3. do not reopen the storage choice once GhostCrab was already chosen
4. do not suggest local files as the default fallback
5. infer the likely activity family in the background
6. state one short intent hypothesis in user language
7. ask 2 to 4 clarification questions, preferably 3
8. make at least half of the questions family-specific
9. mention one likely compact view recommendation
10. end with an explicit prompt-help offer
11. stop there

## Expected First-Reply Shape

The first reply should look like this shape and nothing more:

1. short intent hypothesis
2. 2 to 4 clarification questions
3. likely compact-view recommendation
4. explicit prompt-help offer

It should not include:

- `ghostcrab_status`
- `ghostcrab_schema_list`
- schema tables
- tool lists
- graph edge lists
- record mappings
- local file proposals
- YAML/JSON alternatives
- storage-choice reopening
- setup instructions
- write plans
- initialized scopes

## Direct Prompt Rules To Inject

These are the exact product rules to enforce now:

1. `No surface introspection by default.`
2. `No schema exposition in first reply.`
3. `No alternate persistence if GhostCrab was chosen.`
4. `No file-first fallback.`
5. `Mandatory prompt-help close.`
6. `Compact-view recommendation when the route is visible.`
7. `First-turn fuzzy GhostCrab onboarding must stay product-first and intake-first.`

## Acceptance Bar For The Next Retest

Claude should be considered improved only if all of these hold:

- no `ghostcrab_status` on first-turn fuzzy onboarding unless explicitly requested
- no `ghostcrab_schema_list` on first-turn fuzzy onboarding unless explicitly requested
- no schema tables or tool descriptions in the first reply
- no reopening of storage choice when the user already chose GhostCrab
- no fallback to Markdown/YAML/JSON/local files unless explicitly requested
- one explicit prompt-help offer in every first-turn onboarding reply
- one compact-view recommendation whenever the family is visible
- 2 to 4 questions max
- no setup plan before the user answers

## Short Conclusion

Claude now needs less freedom at the top of the interaction.

The right Pass 4 framing is:

- less GhostCrab inspection
- less schema explanation
- less alternate-storage creativity
- more disciplined product onboarding

The model already understands the domain.
The calibration now has to force it to behave like a GhostCrab guide rather than a GhostCrab operator or a generic file-planning assistant.
