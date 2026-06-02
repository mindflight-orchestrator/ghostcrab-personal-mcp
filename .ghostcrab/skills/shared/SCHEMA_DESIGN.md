# Shared Schema Design

**Intake before schema work:** [ONBOARDING_CONTRACT.md](./ONBOARDING_CONTRACT.md).

These rules apply across Claude Code and OpenClaw integrations.

## Product-Language First

For a first-turn fuzzy onboarding request, do not lead with schema names.
First help the user describe:

- what is being tracked
- what hurts today
- what they want to recover quickly after a pause

Only move into schema language after clarification or explicit implementation intent.

## Five Design Questions

Before introducing a new schema, answer all five:

1. What durable thing is being stored?
2. What decisions should the agent make from this data?
3. What exact filters will be used at retrieval time?
4. What lifecycle states must stay queryable later?
5. What graph relations or pragma packs should be derivable from it?

If the domain is new, also answer:

6. Is this a provisional model or a canonical public schema?
7. Which seeded activity family is the closest match?

## Naming Rules

- use public-facing `ghostcrab:*` schema ids
- keep record ids stable and readable
- prefer domain-first ids such as `demo:compliance:obligation`
- use lowercase kebab or colon namespaces consistently

## Facet Rules

- every schema should have a small required core
- optional facets should reflect real retrieval filters
- avoid decorative facets that never influence search, count, or pack behavior
- lifecycle facets should be explicit when records can stale, expire, or be superseded
- if the domain is provisional, keep facet names simple and reversible

For ingesting **repository files** (paths, markdown sections, code/config shape), use the shared vocabulary in [PATH_CONTENT_FACETS.md](./PATH_CONTENT_FACETS.md) so path- and content-derived dimensions stay consistent and search-oriented.

## Retrieval-Oriented Design

Design schemas for the actual reads:

- `ghostcrab_search` needs strong filter dimensions
- `ghostcrab_count` needs stable groupable values
- `ghostcrab_pack` needs records that compress into actionable context
- `ghostcrab_coverage` and `ghostcrab_traverse` need concept and relation consistency
- `ghostcrab_status` should remain able to tell the agent whether it may extend the model autonomously

## Seed Compatibility

Portable demo seed records should be representable as:

- facts for `ghostcrab_remember`
- nodes and edges for `ghostcrab_learn`
- projections for pragma-oriented startup context

If a schema cannot support a clean seed story, simplify it before shipping it to users.

## Provisional Modeling Rule

For repeated workflows, prefer a provisional model before a canonical schema:

1. facts first
2. graph second
3. projection third
4. confirm only when the user wants the model frozen as part of the public contract

## V1 Freeze Guard

In V1, do not freeze a custom or canonical schema when all that is known is:

- the user has a fuzzy GhostCrab onboarding need
- the likely activity family is visible
- a compact recovery view can already be recommended from canonical primitives

That is not enough reason to freeze a schema.
