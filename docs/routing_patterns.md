# Routing Patterns

GhostCrab now seeds a routing layer so vague user requests can be associated with the right activity family before the agent invents a model.

## Three Seeded Pattern Families

- `ghostcrab:intent-pattern`
- `ghostcrab:signal-pattern`
- `ghostcrab:ingest-pattern`

## Intent Patterns

Intent patterns answer:

- is GhostCrab required?
- what is the default action?
- which activity families are plausible?

Examples:

- `track_over_time`
- `remember_for_later`
- `structure_a_domain`
- `monitor_with_kpis`
- `act_from_external_signal`
- `deploy_to_environment`
- `connect_external_postgresql`
- `sync_from_external_api`
- `resume_paused_project`

## Signal Patterns

Signal patterns map vague wording to a likely family.

Examples:

- `kanban`, `board`, `column`, `backlog` -> `workflow-tracking`
- `release`, `PR`, `migration`, `deploy` -> `software-delivery`
- `incident`, `outage`, `latency`, `runbook` -> `incident-response`
- `lead`, `deal`, `pipeline`, `outreach` -> `crm-pipeline`
- `deploy`, `rollout`, `staging`, `production`, `customer environment` -> `environment-delivery`
- `api`, `webhook`, `external postgres`, `schema mapping`, `credentials` -> `integration-operations`

## Ingest Patterns

Ingest patterns describe how external tools should feed GhostCrab:

- message thread -> summarized task candidate
- email -> summarized opportunity or task
- calendar event -> deadline or follow-up task
- search result -> summarized source-backed note
- meeting -> decision/task candidate
- API response -> source + integration task/constraint candidate
- DB inspection -> schema/source note + integration issue candidate
- deploy log -> source + decision/task/constraint candidate
- customer environment feedback -> blocker + follow-up task

## Design Rule

External systems provide signals.
GhostCrab provides durable structure.

The agent should not dump raw payloads into GhostCrab when a summarized durable record is enough.
