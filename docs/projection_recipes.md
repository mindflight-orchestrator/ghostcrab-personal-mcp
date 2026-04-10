# Projection Recipes

Projection recipes tell clients how to compress live state into a compact working view instead of bloating static heartbeat files.

## Default Rule

If the task is repeated, multi-step, or operationally sensitive:

1. read the activity family
2. load the matching `ghostcrab:projection-recipe`
3. include only the smallest slice that helps the next decision

## Common Shapes

### Workflow Tracking

- one-line summary
- tasks by status
- one primary blocker
- this week's top priorities
- use `phase-heartbeat` when resuming after a pause or moving across phases

### Software Delivery

- active goal
- release blockers
- high-risk PR or migration items
- next integration step

### Incident Response

- severity
- impacted services
- blockers
- next runbook step

### Compliance Audit

- blocking obligations
- unresolved evidence gaps
- next review step

### CRM Pipeline

- opportunities by stage
- blocked deals
- next outreach actions

### Knowledge Base

- active topic
- strongest sources
- open questions
- next clarification step

### Integration Operations

- endpoint status
- newest evidence sources
- active blockers
- next normalization or mapping step

### Environment Delivery

- target environment
- rollout status
- environment blockers
- next safe rollout step

## Heartbeat Guidance

Heartbeat files should describe the method:

- call `ghostcrab_status`
- inspect the active family
- prefer a dynamic projection
- keep the payload small

The facts and KPIs belong in GhostCrab, not in a growing static file.

## Mini Heartbeat

For `workflow-tracking`, the seeded compact view is now `mini-heartbeat`.

Use it when the user asks for:

- a simple status view
- a weekly project update
- blockers and priorities without a heavy dashboard

Preferred render:

- short summary sentence
- Markdown table for task rows when concrete tasks exist
- separate `Blockers` section
- separate `This Week` section

## Other Compact Views

- `phase-heartbeat`:
  - active phase
  - what changed since the last checkpoint
  - blockers
  - next actions
- `integration-health-brief`:
  - endpoint status
  - evidence
  - blockers
  - next actions
- `deployment-brief`:
  - environment
  - rollout status
  - blockers
  - next safe step
- `knowledge-snapshot`:
  - active topic
  - strongest sources
  - open questions
  - next clarification
