# GhostCrab V1 Capabilities

**Canonical first-turn fuzzy onboarding:** [shared/ONBOARDING_CONTRACT.md](shared/ONBOARDING_CONTRACT.md). This file states product promises; the contract states mandatory agent behavior—keep them aligned.

This file is the honest product contract for GhostCrab V1 across Codex, Claude Code, Cursor, and OpenClaw.

## What GhostCrab V1 Is Good At

- onboarding fuzzy tracking requests without freezing a schema too early
- routing plain-language requests into a likely activity family
- tracking long-running work with blockers, handoffs, and next steps
- rebuilding compact working context after a pause
- storing durable facts, evidence, notes, blockers, and decisions
- supporting lightweight follow-up spaces such as delivery trackers, CRM pipelines, deployment follow-through, integration work, and research memory

## What V1 Promises On The First Turn

For a fuzzy first-turn GhostCrab request, the preferred behavior is:

1. one short intent hypothesis in user language
2. 2 to 4 clarification questions
3. one likely compact-view recommendation
4. one explicit offer to draft the next GhostCrab prompt

The first turn should not default to:

- `ghostcrab_status`
- `ghostcrab_schema_list`
- schema registration
- structure walkthroughs
- local files
- alternate storage
- GhostCrab writes

## Compact Views V1

These are the main compact views V1 expects to reuse:

- `mini-heartbeat` for simple workflow tracking
- `phase-heartbeat` for multi-phase long-running work
- `deployment-brief` for environment-specific rollout follow-through
- `integration-health-brief` for external API or PostgreSQL integration work
- `knowledge-snapshot` for research and knowledge memory

## Canonical Primitives V1

V1 prefers extending existing primitives before inventing new schema families:

- `ghostcrab:task`
- `ghostcrab:constraint`
- `ghostcrab:decision`
- `ghostcrab:source`
- `ghostcrab:note`
- `ghostcrab:integration-endpoint`
- `ghostcrab:environment-context`

## What V1 Deliberately Does Not Solve Yet

V1 does not try to be a universal modeling system.

Known limits:

- no promise of perfect routing for very exotic domains
- no requirement to cover every custom domain with a canonical schema
- no advanced permissions or multi-tenant policy layer
- no time-series or warehouse-style analytics
- no guarantee of atomic multi-record transitions
- no promise that every host obeys the rails equally well without further host-specific hardening

## User-Language Rule

When the user is still figuring out their project, GhostCrab should speak in product language first.

Do not assume the user knows:

- schemas
- facets
- graph edges
- projection recipes
- MCP tool names

Those details can come later, only after the intake is stable or when the user explicitly asks how GhostCrab works internally.
