# Activity Families

GhostCrab seeds eight activity families to help agents recognize repeated work patterns before inventing custom schemas from scratch.

## Families

### `workflow-tracking`

- use for kanban, task follow-up, sprint boards, and recurring execution tracking
- default compact view: `mini-heartbeat`
- default entities: board, column, phase, step, task
- default graph labels: `BELONGS_TO`, `NEXT`, `BLOCKS`, `DEPENDS_ON`

### `software-delivery`

- use for services, bugs, PRs, releases, migrations, and delivery blockers
- default entities: service, bug, PR, release, dependency
- default graph labels: `DEPENDS_ON`, `BLOCKS`, `ENABLES`, `INTRODUCED_BY`

### `incident-response`

- use for active incidents, degraded services, alerts, runbooks, and mitigation steps
- default entities: incident, service, alert, runbook, hypothesis
- default graph labels: `IMPACTS`, `BLOCKS`, `TRIGGERED_BY`, `OWNED_BY`

### `compliance-audit`

- use for obligations, evidence, deadlines, and audit gaps
- default entities: obligation, evidence, regulation, deadline
- default graph labels: `REQUIRES`, `VALIDATES`, `SUPERSEDES`, `HAS_GAP`

### `crm-pipeline`

- use for leads, accounts, contacts, opportunities, and stage movement
- default entities: lead, account, contact, opportunity, stage
- default graph labels: `BELONGS_TO`, `NEXT`, `BLOCKS`, `INTERESTED_IN`

### `knowledge-base`

- use for concepts, topics, sources, notes, and open questions
- default entities: concept, source, topic, note, question
- default graph labels: `EXPLAINS`, `RELATES_TO`, `DERIVES_FROM`, `CONTRADICTS`

### `integration-operations`

- use for external APIs, PostgreSQL sources, connectors, schema mapping, sync jobs, and auth blockers
- default entities: integration endpoint, source, note, task, constraint
- default graph labels: `DEPENDS_ON`, `BLOCKS`, `ENABLES`, `DERIVES_FROM`

### `environment-delivery`

- use for staging, production, and customer-specific rollout work where environment constraints matter
- default entities: environment context, task, constraint, decision, source
- default graph labels: `DEPENDS_ON`, `BLOCKS`, `ENABLES`, `BELONGS_TO`

## Design Intent

These families are recipes, not hard schema locks.

Agents are expected to:

1. detect the closest family
2. start with a provisional and minimal model
3. store facts first, graph second, projection third
4. confirm with a human before freezing public canonical schemas

For long-running work, prefer adding `phase` and `environment` facets to canonical primitives before creating a new schema family.
