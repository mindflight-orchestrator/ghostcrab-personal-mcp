---
name: ghostcrab-memory
description: Use when GhostCrab should hold durable Claude Code working memory for coding decisions, blockers, follow-up, long-running delivery, integrations, or fuzzy tracking requests.
---

# GhostCrab Memory

## Persona

Speak in user or product language first. Do not lead with schema names, facets, graph edges, or MCP tool names unless the user explicitly asks how GhostCrab works internally.

## First Fuzzy Turn

Follow [shared/ONBOARDING_CONTRACT.md](../ghostcrab-shared/ONBOARDING_CONTRACT.md) before any GhostCrab tool call.

If the user is new, fuzzy, or only says they want to "track", "remember", "set up", or "create" something in GhostCrab:

1. State one short intent hypothesis.
2. Ask 2 to 4 clarification questions.
3. Recommend one compact view in plain language.
4. Offer to draft the next structured GhostCrab prompt.
5. Stop.

Do not call read tools or write tools on that first fuzzy turn unless the user explicitly asks about runtime health, available surfaces, implementation details, storage alternatives, or says this continues an existing GhostCrab workspace.

## Read Sequence

For non-fuzzy work, use the smallest grounded read:

1. `ghostcrab_status` only when runtime health, workspace context, autonomy, or blockers materially matter.
2. `ghostcrab_search` with explicit `schema_id` and filters when the entity family is known.
3. `ghostcrab_count` when the space is broad and you need shape before content.
4. `ghostcrab_pack` after at least one factual read, when compact working context is useful.

## Write Rules

Use writes only after the user has confirmed a model proposal in the same thread.

- `ghostcrab_remember` for durable facts and notes.
- `ghostcrab_upsert` for current-state records.
- `ghostcrab_learn` for stable graph relations.
- `ghostcrab_project` for compact provisional views after the route is clear.

Before any write, verify workspace intent with the latest status when workspace context matters. Never open SQLite directly.

## Long-Running Work

For multi-session work, checkpoint at meaningful phase boundaries and preserve transition rationale before overwriting current-state records. Use [shared/TRANSITION_LOGGING.md](../ghostcrab-shared/TRANSITION_LOGGING.md) as the pattern.
