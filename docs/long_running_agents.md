# Long-Running Agents With GhostCrab

GhostCrab is optimized for agents that work across days or weeks, not only for one-shot chat memory.

## Durable Contract

- current operational truth lives on canonical current-state records
- `ghostcrab_upsert` is the default mutation path for living trackers
- `agent:observation` is contextual, not the primary status layer
- environment and integration identity should be stored as retrieval facets
- external payloads should be summarized before they become durable records

## Canonical Primitive Set

- `ghostcrab:task`
- `ghostcrab:constraint`
- `ghostcrab:decision`
- `ghostcrab:source`
- `ghostcrab:note`
- `ghostcrab:integration-endpoint`
- `ghostcrab:environment-context`

## Recovery Pattern

When an agent resumes after a pause:

1. read canonical current-state records first
2. read supporting `ghostcrab:source` and `ghostcrab:note` records second
3. then render the smallest compact recovery view:
   - `mini-heartbeat`
   - `phase-heartbeat`
   - `integration-health-brief`
   - `deployment-brief`

## Operational Anti-Patterns

- do not use `agent:observation` as the source of truth for project execution
- do not leave environment identity only in prose
- do not dump raw API or DB inspection payloads into GhostCrab as final durable records
- do not rebuild a recovery brief from stale narrative memory when current-state records exist
