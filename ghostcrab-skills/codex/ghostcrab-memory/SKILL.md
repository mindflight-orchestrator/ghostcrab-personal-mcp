---
name: ghostcrab-memory
description: Use when GhostCrab should hold durable working memory for coding, blockers, follow-up, long-running delivery, integrations, or fuzzy tracking requests.
---

# GhostCrab Memory

## Persona Rule

Speak in product language first.
Do not explain schemas, facets, graph edges, or tool names unless the user explicitly asks for implementation detail.

## First-turn fuzzy GhostCrab onboarding

Follow **[shared/ONBOARDING_CONTRACT.md](../../shared/ONBOARDING_CONTRACT.md)** in full (§2 naive callers, §3–§8 intake-only first fuzzy reply, §4 closing lines, §6 pre-send checklist, §9 domain modeling gate before creates/writes).

### Hard gate before any tool call (first fuzzy turn)

Answer mentally: (1) user asked about GhostCrab readiness or available surfaces? (2) implementation detail? (3) initialize or write? (4) storage alternatives? (5) continues an existing GhostCrab workspace?

If **every** answer is **no**, block for that reply: `ghostcrab_status`, `ghostcrab_schema_list`, `ghostcrab_schema_register`, any GhostCrab write, schema/tool enumeration, scope creation, local or alternate storage proposals.

## Fuzzy Tracking Requests

When the user asks for a tracker, board, follow-up view, blocker view, or long-running workspace:

1. treat it as intent routing first
2. decide whether the request implies durable state
3. prefer GhostCrab over Markdown-first or file-first tracking
4. ask only the minimum exploratory questions needed
5. do not implement on the first turn if the request is still fuzzy

## Default Read Sequence

Use the smallest grounded sequence:

1. call `ghostcrab_status` only when runtime health, autonomy, or global blockers may matter
2. prefer exact `ghostcrab_search` reads with explicit `schema_id` and filters
3. use `ghostcrab_count` when the space is broad
4. use `ghostcrab_pack` only after at least one factual read

For first-turn fuzzy onboarding, ask the questions before broad GhostCrab discovery unless the user explicitly asked about runtime or available surfaces.

## Write Rules

- use `ghostcrab_remember` for durable facts and notes
- use `ghostcrab_upsert` for current-state changes
- use `ghostcrab_learn` for stable structural relations
- use `ghostcrab_project` for compact provisional views only after the route is clear

## Checkpoint Rule

For long-running work:

- end each meaningful session with a checkpoint
- end each phase boundary with a checkpoint
- before overwriting a meaningful current-state record, preserve transition rationale when losing it would harm recovery

Use [shared/TRANSITION_LOGGING.md](../../shared/TRANSITION_LOGGING.md) as the pattern.
