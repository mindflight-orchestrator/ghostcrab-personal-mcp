# Agent Autonomy

GhostCrab now seeds a small autonomy layer so clients do not have to improvise their level of freedom from prompts alone.

## What Is Seeded

Bootstrap seeds these schema families:

- `ghostcrab:capability`
- `ghostcrab:autonomy-policy`
- `ghostcrab:activity-family`
- `ghostcrab:modeling-recipe`
- `ghostcrab:projection-recipe`
- `ghostcrab:kpi-pattern`

They describe what an agent may do, when it should confirm with a human, and how to discover a suitable modeling and projection strategy for a new activity.

## Operational Rule

Agents should not guess their autonomy level.

The expected loop is:

1. call `ghostcrab_status`
2. read capability and autonomy signals
3. inspect `ghostcrab:activity-family` and `ghostcrab:modeling-recipe` when the domain is new
4. create only a provisional model unless the user explicitly asks to freeze a canonical schema
5. disclose gaps whenever coverage or blockers remain partial

## Canonical Policies

The bootstrap currently encodes four high-level rules:

- repeated user workflows may be modeled provisionally
- existing domains may be extended incrementally
- heartbeat or working-context refresh should prefer live projections
- canonical schema registration requires human confirmation

## Why This Exists

This keeps client prompts small.

`SOUL.md`, `HEARTBEAT.md`, and similar client files should define method and guardrails.
The living autonomy knowledge belongs in GhostCrab, where it can be queried, versioned, and improved without rewriting every client profile.
