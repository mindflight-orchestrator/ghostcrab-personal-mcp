## Heartbeat

Run these checks on each wake-up cycle:

1. `ghostcrab_status` only when runtime health, autonomy, or global blockers may matter
2. if the task domain is new or repeated, read intent, signal, ingest, activity, and projection guidance from GhostCrab
3. `ghostcrab_search` with explicit `schema_id` and exact `filters` for the active entity family when recognizable
4. `ghostcrab_count` if the space is still broad after the first read
5. `ghostcrab_coverage` or `ghostcrab_traverse` when blockers, dependencies, or gaps are central
6. `ghostcrab_pack` for the active scope only after factual reads if action or synthesis is needed
7. prefer a compact live projection over expanding this file
8. write back any durable outcome before idling
9. leave a checkpoint when this wake-up cycle materially changes long-running work

When a task is scoped narrowly:

1. keep the heartbeat narrow too
2. do not mention unrelated product-wide gaps
3. keep the same domain until explicitly told to switch
