# Codex Calibration Pass 1

This note captures the first natural-behavior pass for Codex on GhostCrab.

Scope:

- fuzzy onboarding
- external API integration
- external PostgreSQL integration
- environment-specific deployment
- mini CRM
- knowledge memory

## Executive Summary

Codex is currently the most stable host on GhostCrab guardrails.

What already works well:

- no immediate implementation on fuzzy onboarding
- no premature `ghostcrab_schema_register`
- good first-turn discipline
- good separation between current-state tracking and durable context
- good behavior on light workflow, CRM, and knowledge-memory use cases

Main remaining weakness:

- the intake questions are often too generic across scenarios
- Codex respects the contract, but does not specialize enough once the likely activity family is visible
- it rarely offers a starter prompt
- it rarely offers prompt help explicitly
- it rarely proposes the compact view that best fits the detected family

## Outcome By Scenario

### Strong

- multi-phase onboarding
- mini CRM
- knowledge memory

### Acceptable But Too Generic

- external API integration
- external PostgreSQL integration
- environment-specific deployment

## Prompt Zones Impacted

The useful next step is not to add more product primitives.

The useful next step is to improve the prompt zones that shape first-turn behavior.

### 1. Intent Analysis

Current behavior:

- Codex usually understands the broad need
- it often identifies the request as a light, durable GhostCrab workspace
- but it does not always convert that understanding into scenario-specific intake

Observed weakness:

- after recognizing the broad shape, Codex falls back to a generic onboarding template
- the same question pattern reappears across project tracking, API integration, PostgreSQL integration, and deployment

Desired behavior:

- first infer the likely activity family
- then derive the question set from the family-specific uncertainty
- then state a short intent hypothesis before asking questions

Recommended prompt upgrade:

- add an explicit step: `Before asking questions, infer the most likely activity family and name the top uncertainty that still blocks a minimal GhostCrab setup.`
- add an explicit rule: `Do not reuse a generic question set if the request clearly signals a specific family such as integration-operations, environment-delivery, crm-pipeline, or knowledge-base.`

Desired first-turn shape:

1. intent hypothesis
2. 2 to 4 family-shaped questions
3. one starter prompt
4. no implementation

Example of stronger intent phrasing:

- `This sounds like integration-operations with durable current-state tracking, external evidence, and blocker recovery.`
- `This sounds like environment-delivery where the key unknowns are target environment, rollout gates, and the current safe next step.`

### 2. Question Generation

Current behavior:

- Codex stays within the 2 to 4 question rule
- questions are clear and generally useful
- but they are often recycled from one scenario to another

Observed weak pattern:

- project name
- task statuses
- what should show up on resume
- daily or weekly cadence

This pattern is not wrong, but it is too flat for scenario-sensitive onboarding.

Desired behavior:

- keep at most 1 generic scaffolding question
- spend the remaining questions on the uncertainties that are specific to the family

Recommended prompt upgrade:

- add a rule: `At least half of the questions must be specific to the detected activity family.`
- add a rule: `Only ask about cadence if it changes the recommended GhostCrab setup or compact view.`

Family-specific question anchors:

- `workflow-tracking`
  - what are the active phases or workstreams?
  - are handoffs and blockers more important than detailed task history?
  - what should a resume view optimize for: phase, blockers, or this week's priorities?

- `integration-operations`
  - what system is being connected?
  - what kind of auth or access constraint exists?
  - what are the critical endpoints or data flows?
  - where do the external docs or evidence live today?
  - what is the current blocker or next validation step?

- `environment-delivery`
  - what exact environment is targeted?
  - what local constraints or rollout gates matter?
  - what is the current rollout stage?
  - what is the current safe next step?

- `crm-pipeline`
  - what are the deal stages that actually matter?
  - what counts as blocked?
  - what must come back first on resume: relances, hottest opportunities, or stuck deals?

- `knowledge-base`
  - what is the active topic?
  - what counts as a strong source?
  - what kind of open question do we want to track?
  - is resume on demand, weekly, or tied to research checkpoints?

### 3. Family Routing

Current behavior:

- Codex often behaves as if it detected the right family
- but it does not surface that routing clearly

Observed weakness:

- because the route remains implicit, the intake questions do not visibly branch enough

Desired behavior:

- route early and say so briefly
- use the family as the frame for questions, model shape, and compact-view recommendation

Recommended prompt upgrade:

- add a rule: `When the likely family is clear enough, say it in one short sentence before the questions.`
- add a rule: `If two families are plausible, say the leading one and the main ambiguity instead of staying fully generic.`

### 4. Compact View Recommendation

Current behavior:

- Codex almost never proposes the compact view on its own

Observed weakness:

- the model reaches a good intake posture, but misses one of the product contract goals: guide the user toward the smallest useful recovery view

Desired behavior:

- after the questions, suggest the default compact view that would likely fit if the user's answers confirm the route

Recommended prompt upgrade:

- add a rule: `On first-turn onboarding, propose a likely compact view in one short clause when the activity family is visible.`

Examples:

- workflow-tracking -> `likely resume view: mini-heartbeat`
- integration-operations -> `likely resume view: integration-health-brief`
- environment-delivery -> `likely resume view: deployment-brief`
- knowledge-base -> `likely resume view: knowledge-snapshot`

Important:

- this should stay a recommendation, not a forced answer shape

### 5. Starter Prompt Offer

Current behavior:

- Codex rarely offers the user a starter prompt even when the contract expects it

Observed weakness:

- the onboarding feels careful, but not yet productized

Desired behavior:

- after the questions, offer one short starter prompt the user could reuse next

Recommended prompt upgrade:

- add a rule: `End first-turn onboarding with one short starter prompt or one promise to generate it after the user answers.`

Good shape:

- `If you want, once you answer these 4 points I can give you a copy-paste GhostCrab starter prompt for this setup.`

### 6. Prompt-Help Offer

Current behavior:

- Codex does not clearly tell the user that it can help turn the answers into a structured GhostCrab prompt

Observed weakness:

- the onboarding stops at clarification
- the user is not guided toward the next practical action
- the interaction feels careful, but not yet productized as a prompt-assistance flow

Desired behavior:

- after or alongside the questions, Codex should signal that it can help write the next structured GhostCrab prompt
- this can be a starter prompt, a stricter variant, or both

Recommended prompt upgrade:

- add a rule: `During first-turn onboarding, explicitly offer prompt help for the next step instead of only saying that you will propose a structure.`
- add a rule: `Phrase the offer in user language, not in tool or schema language.`

Good shapes:

- `Si tu veux, une fois que tu m'as répondu, je peux te rédiger un prompt GhostCrab propre pour démarrer.`
- `Je peux aussi te proposer une version plus structurée du prompt si tu veux cadrer davantage le suivi dès le départ.`

### 7. Current-State Framing

Current behavior:

- this is one of Codex's strongest areas
- it already tends to preserve the distinction between present-state tracking and supporting context

Observed strength to preserve:

- `ghostcrab:task` as present-state carrier
- durable observations, notes, and sources kept separate
- no pressure to over-model too early

Prompt protection to keep:

- `For living trackers, keep current state on canonical records and keep notes, observations, and sources as support context rather than a parallel status system.`

## Recommended Codex Prompt Changes

If we update Codex-facing guidance, the highest-value additions are:

1. `Infer the most likely activity family before asking questions.`
2. `State a one-sentence intent hypothesis.`
3. `Make at least half of the questions family-specific.`
4. `Do not ask about cadence unless it changes the recommended setup or compact view.`
5. `Offer one likely compact view once the family is visible.`
6. `Offer one starter prompt or promise one after the answers.`
7. `Explicitly tell the user that you can help write the next structured GhostCrab prompt.`

## Suggested Acceptance Bar For Pass 2

Codex pass 2 should be considered improved if:

- scenario 1 still stays disciplined
- scenarios 2 to 4 no longer reuse the same intake skeleton
- each technical scenario includes at least 2 specialized questions
- at least one compact-view recommendation appears naturally
- at least one starter prompt offer appears naturally

## Short Conclusion

Codex does not need heavier restrictions.

Codex needs sharper first-turn routing and question shaping.

The core issue is not lack of discipline.
The core issue is that intent analysis is not yet strongly coupled to family-specific intake behavior.
