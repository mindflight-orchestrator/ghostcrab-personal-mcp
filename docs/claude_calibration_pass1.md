# Claude Code Calibration Pass 1

This note captures the first natural-behavior pass for Claude Code on GhostCrab.

Target model:

- Sonnet 4.6

Scope:

- fuzzy multi-phase onboarding
- external API integration
- external PostgreSQL integration
- environment-specific deployment
- mini CRM
- knowledge memory

## Executive Summary

Claude Code is strong at:

- intent detection
- activity-family specialization
- recognizing the right GhostCrab primitives quickly

Claude Code is currently weak at:

- first-turn onboarding discipline
- delaying reads and writes on fuzzy requests
- staying in intake mode until the user answers
- offering prompt help instead of acting directly

The core problem is not misunderstanding.

The core problem is premature conversion of correct understanding into GhostCrab actions.

## Observed Pattern

Across the six scenarios, Claude typically did this:

1. detect the right family quickly
2. name the right schemas and primitives
3. invent a provisional scope
4. initialize projections or durable records immediately
5. ask too few questions or ask them too late

That behavior is useful for an execution agent.
It is misaligned for GhostCrab product onboarding.

## Outcome By Scenario

### Strong On Understanding

- external API integration
- external PostgreSQL integration
- environment-specific deployment
- mini CRM
- knowledge memory

### Weak On Product Contract

- fuzzy onboarding
- external API integration
- external PostgreSQL integration
- environment-specific deployment
- mini CRM
- knowledge memory

In practice, the same contract break repeated almost everywhere:

- early reads
- early writes
- early scope invention
- early workspace bootstrap

## Prompt Zones Targeted

The highest-value Claude changes are not about adding more modeling guidance.

They are about controlling the transition between:

- detecting intent
- deciding to read
- deciding to write
- deciding to initialize a workspace

### 1. First-Turn Onboarding Gate

Current behavior:

- Claude treats many fuzzy requests as implicit permission to start GhostCrab setup

Observed failure:

- it initializes GhostCrab state before clarification
- it acts as if "this use case is obvious" means "the user wants me to create it now"

Desired behavior:

- first-turn fuzzy requests must stay intake-only unless the user explicitly asks to initialize or write

Recommended prompt upgrade:

- add an explicit gate:
  - `On a first-turn fuzzy GhostCrab request, do not perform any GhostCrab write.`
- add a second explicit gate:
  - `Do not initialize a scope, projection, task, note, constraint, source, endpoint, or decision record before the user answers the clarification questions.`

Suggested hard rule:

- `First-turn fuzzy onboarding = zero GhostCrab writes.`

### 2. Read Gating

Current behavior:

- Claude often starts with GhostCrab reads even when the user is still only asking how to structure the work

Observed failure:

- `ghostcrab_status`
- `ghostcrab_schema_list`
- schema surfacing and tool surfacing too early

Why this hurts:

- it shifts the interaction from product help to tool operation
- it makes the agent sound like it already committed to a modeling route
- it encourages immediate setup behavior

Desired behavior:

- on a fuzzy onboarding turn, Claude should reason from the user request first
- GhostCrab reads should be delayed until they are needed to answer a clarified question or to begin user-approved setup

Recommended prompt upgrade:

- add an explicit read block:
  - `Do not call ghostcrab_status, ghostcrab_schema_list, or broad GhostCrab discovery tools on a first-turn fuzzy onboarding request unless runtime health or surface availability is the user's actual question.`

Suggested hard rule:

- `For first-turn fuzzy onboarding, user-language reasoning comes before GhostCrab reads.`

### 3. Scope Invention

Current behavior:

- Claude invents names like `api-partner-connect`, `pg-external-connect`, `env-deploy`, or `knowledge-explore`

Observed failure:

- scope names are created before the user confirms the project, domain, or naming

Why this hurts:

- it silently turns onboarding into initialization
- it creates accidental durable structure the user did not ask for

Desired behavior:

- if a scope name matters, ask for it
- if the user did not give one, propose one only as a draft, not as an initialized value

Recommended prompt upgrade:

- add an explicit rule:
  - `Do not invent and initialize a GhostCrab scope on first-turn onboarding. If a name is needed, ask for it or present it as a draft only.`

### 4. Action Threshold

Current behavior:

- Claude moves from "I understand the likely setup" to "I will bootstrap it now"

Observed failure:

- it confuses high confidence with permission to act

Desired behavior:

- confidence in the likely family should change the question quality, not trigger immediate writes

Recommended prompt upgrade:

- add an explicit threshold rule:
  - `When the likely family is clear, use that confidence to specialize the clarification questions, not to start initialization.`

This is especially important for Sonnet 4.6 because it is strong enough to see the right route quickly and then over-act.

### 5. Output Shape

Current behavior:

- Claude often answers as:
  - route
  - schema/primitives
  - bootstrap
  - operating pattern

Desired behavior:

- Claude should answer first-turn fuzzy onboarding as:
  1. short intent hypothesis
  2. 2 to 4 questions
  3. likely compact view as a recommendation only
  4. explicit offer to help write the next structured GhostCrab prompt

Recommended prompt upgrade:

- add an explicit output contract:
  - `For first-turn fuzzy onboarding, your answer must stop after intent hypothesis, clarification questions, and prompt help. Do not include writes performed, initialized records, or operating procedures.`

Suggested user-facing shape:

- `This sounds like environment-delivery with a strong need for safe recovery after interruption.`
- `Questions: ...`
- `Likely recovery view: deployment-brief.`
- `If you want, once you answer these points I can draft the next structured GhostCrab prompt for you.`

### 6. Prompt-Help Offer

Current behavior:

- Claude rarely offers prompt help in a clear productized way

Observed failure:

- it prefers to build the workspace rather than help the user phrase the next step

Desired behavior:

- Claude should explicitly say that it can help write the next structured prompt
- that prompt can be a starter prompt or a stricter variant

Recommended prompt upgrade:

- add an explicit rule:
  - `On first-turn onboarding, always offer help writing the next GhostCrab prompt in plain user language.`

Good examples:

- `Si tu veux, après tes réponses je peux te rédiger un prompt GhostCrab propre pour démarrer.`
- `Je peux aussi te proposer une version plus cadrée si tu veux éviter toute dérive dès le départ.`

### 7. Compact View Recommendation

Current behavior:

- Claude sometimes implies the right compact view, but often turns it into initialization instead of recommendation

Observed failure:

- it mentions `ghostcrab_pack`, checkpoints, or projections as an active setup pattern rather than a suggested recovery view

Desired behavior:

- compact view should be suggested, not instantiated

Recommended prompt upgrade:

- add an explicit rule:
  - `You may recommend the likely compact view on onboarding, but you must not initialize it or create projection records on that first fuzzy turn.`

### 8. Anti-Tool-First Framing

Current behavior:

- Claude tends to sound like a GhostCrab operator, not a GhostCrab guide

Observed failure:

- references to specific schemas and tools appear before user clarification

Desired behavior:

- on first-turn fuzzy asks, explain in product language first
- defer tool language until the user wants setup or deeper detail

Recommended prompt upgrade:

- add an explicit style rule:
  - `On onboarding, prefer product language over tool language until the user asks to initialize, inspect schemas, or see the implementation detail.`

## Proposed Claude Prompt Rules

These are the most valuable concrete additions for Sonnet 4.6:

1. `First-turn fuzzy onboarding = zero GhostCrab writes.`
2. `Do not call ghostcrab_status or ghostcrab_schema_list on first-turn fuzzy onboarding unless the user explicitly asks about runtime health or available surfaces.`
3. `Do not invent or initialize a scope before the user answers.`
4. `Use confidence in the activity family to shape questions, not to start setup.`
5. `Answer in this order: intent hypothesis, 2 to 4 questions, likely compact view, prompt-help offer.`
6. `Do not include initialized records, operating procedures, or write plans in the first fuzzy reply.`
7. `Always offer help writing the next structured GhostCrab prompt.`
8. `Recommend compact views only; never initialize them on the first fuzzy turn.`

## Suggested Acceptance Bar For Pass 2

Claude pass 2 should be considered improved if:

- scenario 1 performs no GhostCrab read or write before clarification
- scenarios 2 to 6 perform zero writes on first turn
- no provisional scope is created without user confirmation
- at least one explicit prompt-help offer appears in every onboarding answer
- compact views are mentioned only as recommendations
- the answer shape remains intake-first rather than operator-first

## Short Conclusion

Claude Code does not need stronger domain understanding.

Claude Code needs a stronger onboarding gate.

For Sonnet 4.6, the key design principle is:

- reward correct routing
- but forbid action before clarification

The model already knows too much to stay safe by default.
So the rails must make "understanding" and "acting" two separate steps.
