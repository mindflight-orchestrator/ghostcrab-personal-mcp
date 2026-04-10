# Claude Code Calibration Pass 3

This note captures the third Claude Code pass after:

- harder onboarding rails
- database reset
- one fresh thread per scenario

This pass is more reliable than the previous one because:

- scenarios were isolated
- prior scopes did not pollute later runs
- first-turn behavior was observed more cleanly

## Executive Summary

Claude Code improved on the most dangerous failure mode:

- fewer premature GhostCrab writes
- fewer immediate workspace bootstraps

The main remaining problem is now clearer:

- Claude is still too `read-first`
- Claude is still too `schema-first`

So the center of gravity has shifted:

- Pass 1 and Pass 2: too eager to act
- Pass 3: less eager to write, but still too eager to inspect and explain GhostCrab internals before onboarding is complete

## Core Finding

Claude now often avoids immediate writes.

But on many first-turn fuzzy requests, it still does one or more of these too early:

- `ghostcrab_status`
- `ghostcrab_schema_list`
- broad schema explanation
- tool-oriented structure walkthrough
- model proposal before clarification is complete

That means the current guardrails are partially working, but they are mostly stopping writes.
They are not yet stopping premature GhostCrab introspection.

## Outcome By Scenario

### Best Run

- environment-specific deployment

Why it was strongest:

- no early tool call
- user-language questions
- domain-specific intake
- no bootstrap

### Improved But Still Too Internal

- multi-phase project
- external PostgreSQL integration
- knowledge memory

Pattern:

- no immediate writes
- but too much schema/tool framing before clarification finishes

### Still Problematic

- external API integration
- lightweight CRM

Pattern:

- Claude still tries to move too fast toward structure, projections, or schema-grounded setup

## Prompt Zones Targeted

The dominant remaining defect is not "write too early."

It is:

- `look inside GhostCrab too early`
- `explain GhostCrab structure too early`

So the prompt work now needs to focus on read gating and schema-language gating.

### 1. Read-First Gating

Current behavior:

- Claude often calls `ghostcrab_status` and `ghostcrab_schema_list` on first-turn fuzzy onboarding

Observed effect:

- the answer becomes tool-led instead of user-led
- the model starts reasoning from system internals instead of the user's problem
- once those reads happen, Claude becomes much more likely to explain schemas and tools instead of staying in intake

Desired behavior:

- first-turn fuzzy onboarding should start from user-language interpretation, not GhostCrab inspection

Recommended prompt upgrade:

- strengthen the rule from "do not call unless needed" to:
  - `On a first-turn fuzzy GhostCrab onboarding request, do not call ghostcrab_status or ghostcrab_schema_list by default.`
  - `Only call them if the user's actual question is about runtime readiness, available GhostCrab surfaces, or whether GhostCrab is installed correctly.`

Suggested hard rule:

- `No status/schema reads on first-turn fuzzy onboarding unless the user explicitly asks about the GhostCrab surface itself.`

### 2. Schema-First Framing

Current behavior:

- Claude quickly translates the request into:
  - activity family
  - schema list
  - tool list
  - suggested record mapping

Observed effect:

- even without writing, it still jumps out of onboarding mode
- the conversation feels like internal implementation planning, not user help

Desired behavior:

- on first-turn onboarding, Claude should stay in product language first
- schema and tool language should be delayed until the user asks for implementation or approves setup

Recommended prompt upgrade:

- add an explicit style rail:
  - `Do not enumerate GhostCrab schemas, tools, graph edges, or record mappings on the first fuzzy reply unless the user explicitly asks how GhostCrab would be implemented.`

Suggested hard rule:

- `First-turn fuzzy onboarding should be product-first, not schema-first.`

### 3. Clarification Completion Threshold

Current behavior:

- Claude sometimes asks good questions, but starts proposing structure before the intake is actually done

Observed effect:

- the reply mixes:
  - some clarification
  - some schema interpretation
  - some setup planning

Desired behavior:

- the first reply should stop before any structural prescription beyond a very light route hypothesis

Recommended prompt upgrade:

- add a clearer threshold:
  - `Do not propose a GhostCrab structure, model shape, or scoped setup until the user has answered the clarification questions.`

This goes beyond zero writes.
It also blocks premature design explanation.

### 4. Output Shape Enforcement

Current behavior:

- Claude sometimes gets part of the shape right, but still inserts internal explanations

Desired behavior:

The first fuzzy reply should be constrained to:

1. short intent hypothesis
2. 2 to 4 clarification questions
3. one likely compact-view recommendation
4. one explicit prompt-help offer

Nothing else should appear by default.

Recommended prompt upgrade:

- add a hard output rule:
  - `If the request is first-turn fuzzy onboarding, do not include schema descriptions, tool walkthroughs, graph-edge discussions, or record-level design notes in the first reply.`

### 5. Prompt-Help Offer

Current behavior:

- this is still the weakest product behavior
- Claude almost never clearly says it can write the next structured GhostCrab prompt

Observed effect:

- the interaction still feels like a technical consultation, not a guided onboarding flow

Desired behavior:

- every onboarding reply should end with an explicit prompt-help offer

Recommended prompt upgrade:

- strengthen the rail from optional to mandatory:
  - `Every first-turn fuzzy onboarding reply must include one explicit offer to write the next GhostCrab prompt.`

Good examples:

- `Si tu veux, après tes réponses je peux te rédiger un prompt GhostCrab propre pour démarrer.`
- `Je peux aussi te proposer une version plus stricte si tu veux cadrer le suivi dès le départ.`

### 6. Question Count Discipline

Current behavior:

- Claude sometimes asks too many questions
- the environment-delivery run was good in content, but went above the preferred range

Desired behavior:

- preserve specificity while staying within 2 to 4 questions

Recommended prompt upgrade:

- add a tighter count rule:
  - `Prefer 3 questions. Never exceed 4 on first-turn onboarding unless the user explicitly asked for a detailed intake.`

### 7. Family-Specific Question Quality

Current behavior:

- when Claude stays in onboarding mode, its questions can be very good
- the deployment scenario showed this clearly

What to preserve:

- strong domain specialization
- contextual questions
- good detection of hidden ambiguity

Recommended prompt protection:

- `Use the likely activity family to sharpen the questions, but do not convert that confidence into schema explanation or setup.`

## Proposed Claude Rules For Pass 4

These are the highest-value additions now:

1. `No ghostcrab_status or ghostcrab_schema_list on first-turn fuzzy onboarding unless the user explicitly asks about GhostCrab readiness or available surfaces.`
2. `Do not enumerate schemas, tools, graph edges, or record mappings on the first fuzzy reply.`
3. `Do not propose structure or setup before the user answers the clarification questions.`
4. `First fuzzy reply must contain only: intent hypothesis, 2 to 4 questions, likely compact view, prompt-help offer.`
5. `Every first-turn fuzzy onboarding reply must contain an explicit prompt-help offer.`
6. `Prefer 3 questions; never exceed 4 unless the user asked for a detailed intake.`

## Suggested Acceptance Bar For Next Pass

Claude should be considered improved if:

- scenario 1 contains no `ghostcrab_status` or `ghostcrab_schema_list`
- scenario 2 does not propose projections or scoped setup before answers
- scenario 5 does not jump to CRM schema design before clarification
- scenario 6 does not explain graphs or record mapping on the first reply
- every scenario ends with an explicit prompt-help offer
- every scenario stays within 2 to 4 questions

## Short Conclusion

Claude is no longer failing mainly because it writes too early.

Claude is now failing mainly because it thinks too much through GhostCrab internals before the onboarding conversation is finished.

So the next calibration step for Sonnet 4.6 is:

- less system introspection
- less schema explanation
- more user-language intake discipline

The model already routes well.
It now needs to delay internal exposition until the user has actually asked for setup.
