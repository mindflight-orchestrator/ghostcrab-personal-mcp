---
name: ghostcrab-architect
version: 2.0
description: |
  Advanced GhostCrab Personal modeling skill for Hermes-Agent, Claude Code, Codex,
  and other MCP clients. Use after the basic SKILL_ghostcrab-mcp.md loop has
  already proven that GhostCrab is running and useful for the project.
triggers:
  - "build an ontology with ghostcrab"
  - "create a ghostcrab model"
  - "ghostcrab architect"
  - "structure this domain in ghostcrab"
  - "bootstrap a project model"
  - "create dependencies in ghostcrab"
agents:
  - hermes-agent
  - claude-code
  - codex
---

# Skill: GhostCrab Architect

## Advanced Skill

Use this only after the project has already used `SKILL_ghostcrab-mcp.md` and the
basic memory loop works:

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_remember`
4. `ghostcrab_search`

This skill is for turning repeated project memory into a clearer workspace model:
record types, facets, relationships, blockers, and recovery projections.

## Setup Baseline

GhostCrab Personal setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

MCP client config:

```json
{
  "mcpServers": {
    "ghostcrab-personal": {
      "command": "gcp",
      "args": ["brain", "up"]
    }
  }
}
```

Default storage is MindBrain Personal SQLite. Default transport is local `stdio`.

## First Checks

Before modeling:

1. Call `ghostcrab_status`.
2. Call `ghostcrab_workspace_list`.
3. Select the existing project workspace or call `ghostcrab_workspace_create`.
4. Call `ghostcrab_pack`.
5. If the pack is empty, continue. A new workspace may not have context yet.

Always list workspaces before creating a new one.

## Modeling Goal

The agent does the reasoning. GhostCrab stores the durable structure.

Do not try to freeze a perfect ontology on the first pass. Use provisional records
until real project work reveals stable categories.

## Guided Modeling Questions

Ask one question at a time:

1. What is the project or domain?
2. Which entities or work items recur?
3. Which statuses matter?
4. Which phases or stages matter?
5. Which dependencies or blockers should be directional?
6. Which facts should be durable history?
7. Which states should be mutable current records?

Read back the summary before writing new structure.

## Write Rules

### Durable history

Use `ghostcrab_remember` for decisions, findings, observations, and completed
results.

```text
ghostcrab_remember(
  workspace_id="crm-migration",
  content="Legal review must happen before contract import can be marked complete.",
  facets={
    "record_type": "constraint",
    "phase": "validation",
    "source": "architect_modeling"
  }
)
```

### Current state

Use `ghostcrab_upsert` for the current state of a task, blocker, milestone, phase,
or artifact.

```text
ghostcrab_upsert(
  workspace_id="crm-migration",
  schema_id="project:state",
  match={ "facets": { "record_id": "phase:contract-import" } },
  create_if_missing=true,
  set_content="Contract import is waiting for legal sample approval.",
  set_facets={
    "record_id": "phase:contract-import",
    "record_type": "phase_state",
    "phase": "validation",
    "status": "waiting"
  }
)
```

### Relationships

Use `ghostcrab_learn` for directed relationships:

```text
ghostcrab_learn(
  edge={
    "source": "phase:contract-import",
    "label": "depends_on",
    "target": "decision:legal-sample-approval"
  }
)
```

Confirm relationship direction before writing. `A depends_on B` means A is waiting
for B.

### Recovery heartbeat

Use `ghostcrab_project` after structural changes:

```text
ghostcrab_project(
  scope="crm-migration",
  proj_type="CONSTRAINT",
  status="active",
  content="Contract import cannot close until legal sample approval is recorded.",
  weight=0.9
)
```

## Refinement Procedure

1. Load context with `ghostcrab_pack`.
2. Search existing records with `ghostcrab_search`.
3. Count current distribution with `ghostcrab_count` when statuses or phases matter.
4. Ask the next missing modeling question.
5. Write durable facts with `ghostcrab_remember`.
6. Update current records with `ghostcrab_upsert`.
7. Link dependencies with `ghostcrab_learn`.
8. Verify important chains with `ghostcrab_traverse`.
9. Leave a heartbeat with `ghostcrab_project`.

## Schema Inspection

Use schema tools after a pattern stabilizes:

1. `ghostcrab_schema_list`
2. `ghostcrab_schema_inspect`
3. `ghostcrab_workspace_export_model` if another system needs a model contract

If no schema fits, continue with stable facets such as `record_id`, `record_type`,
`phase`, `status`, `owner`, and `priority`. Do not invent non-public tool names.

## Structural Gap Checks

Use these checks before ending a modeling session:

- `ghostcrab_search` for records missing expected facets
- `ghostcrab_count` grouped by `record_type` and `status`
- `ghostcrab_traverse` from active blockers or dependencies
- `ghostcrab_pack` to confirm the next session has a useful briefing

Surface gaps as specific questions. Do not fabricate entities or relationships
to make the model look complete.

## Failure Modes

| Failure | Fix |
| --- | --- |
| GhostCrab is unavailable | Ask the user to run `gcp brain up` and stop modeling writes. |
| Workspace is missing | Create it with `ghostcrab_workspace_create` after checking `ghostcrab_workspace_list`. |
| Pack is empty | Treat as first run and continue with careful first writes. |
| Search misses expected records | Broaden query or inspect facets; one miss does not prove absence. |
| Relationship direction is unclear | Ask the user before calling `ghostcrab_learn`. |
| Current state would overwrite useful rationale | Store rationale with `ghostcrab_remember`, then update with `ghostcrab_upsert`. |

## PRO Note

This advanced skill targets GhostCrab Personal SQLite. PostgreSQL is only the PRO
path for later centralized deployments.
