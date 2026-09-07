# Shared Transition Logging

GhostCrab often keeps current state on canonical records such as `ghostcrab:task`.

`ghostcrab_upsert` no longer loses the state it replaces: on any change of content
or facets it archives the previous state as a closed row that the current record
supersedes, and the current record keeps its id. So the *what* of a transition is
kept for you — you do not need a manual copy of the old values, and you do not need
to write history by hand.

What the archive does not hold is the **why**. It records that status went from
`in_progress` to `blocked`; it cannot record what blocked it, what evidence says so,
or what the next step is. That is what a transition note is for.

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

- why it changed
- what evidence supports the change
- what the next step is

From-state and to-state are already in the archive chain, so re-stating them buys
nothing; write the part the record cannot infer.

## V1 Pattern

V1 does not require a new primitive.
Use an existing durable note or decision pattern when rationale would otherwise be lost.

Recommended order:

1. write the transition note or decision
2. update the current-state record in place
3. refresh the compact recovery view at the next checkpoint

## Reading The History Back

Reads only ever return current state: archived rows are closed, so `ghostcrab_search`,
`ghostcrab_count` and `ghostcrab_pack` never surface them. The chain is walked from the
current record instead — its `supersedes` points at the state it replaced, and each
archive keeps the `supersedes` it had.

Two consequences worth knowing:

- selectors describing a **past** state no longer match anything. After `todo -> done`,
  an upsert matching `status: "todo"` finds nothing; match on a stable `record_id`.
- an expired fact (`valid_until` in the past) is equally invisible, and a fact whose
  `valid_from` is in the future stays out of reads until that date.

## Checkpoint Relationship

Transition logging is not the same as a checkpoint.

- transition logging preserves why a state changed
- checkpoint preserves where the work stands now

Long-running work usually benefits from both.
