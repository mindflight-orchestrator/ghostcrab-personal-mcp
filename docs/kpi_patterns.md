# KPI Patterns

GhostCrab seeds KPI patterns so agents can discover a good first projection without a literal domain-specific tutorial.

## Universal Questions

For any repeated activity, start by asking:

- how many items are active?
- what is blocked?
- what changed recently?
- what is due next?
- what is at risk?

## Seeded Examples

### `workflow-tracking`

- tasks by status
- tasks by priority
- blocked tasks
- tasks by phase

### `software-delivery`

- PRs by status
- bugs by severity

### `incident-response`

- incidents by severity
- services by status

### `compliance-audit`

- obligations by status
- evidence by owner

### `crm-pipeline`

- opportunities by stage
- leads by owner

### `knowledge-base`

- notes by topic
- questions by status

### `integration-operations`

- endpoints by status
- tasks by environment

### `environment-delivery`

- environments by status
- constraints by environment

## Practical Use

`ghostcrab_pack` can now surface:

- detected activity family
- recipe used
- KPI patterns used
- compact grouped snapshots when the seeded pattern maps to a valid schema and facet

This is enough to keep agent heartbeat files short while still grounding them in live context.
