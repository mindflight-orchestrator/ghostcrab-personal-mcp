# Shared Transition Logging

GhostCrab often keeps current state on canonical records such as `ghostcrab:task`.
That is good for retrieval, but it means a plain `ghostcrab_upsert` can erase context that mattered.

## When To Log A Transition

Log a transition before or alongside an in-place state change when:

- the status changed across a meaningful boundary
- the owner changed during a handoff
- the phase changed
- a blocker opened or resolved
- the rationale for the change would matter when resuming later

Examples:

- `planned -> in_progress`
- `in_progress -> blocked`
- `blocked -> in_progress`
- `proposal_sent -> negotiation`
- `staging -> prod`

## What To Preserve

Capture the smallest durable explanation that will matter later:

- from state
- to state
- why it changed
- what evidence supports the change
- what the next step is

## V1 Pattern

V1 does not require a new primitive.
Use an existing durable note or decision pattern when rationale would otherwise be lost.

Recommended order:

1. write the transition note or decision
2. update the current-state record in place
3. refresh the compact recovery view at the next checkpoint

## Checkpoint Relationship

Transition logging is not the same as a checkpoint.

- transition logging preserves why a state changed
- checkpoint preserves where the work stands now

Long-running work usually benefits from both.
