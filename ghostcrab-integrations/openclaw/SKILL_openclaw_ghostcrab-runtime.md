---
name: ghostcrab-runtime
version: 1.0.0
description: >
  Runtime state skill for OpenClaw agents using GhostCrab Personal SQLite:
  task status, findings, dependencies, active goals, recovery context, and
  handoffs across skill invocations.
homepage: https://www.ghostcrab.be
repository: https://github.com/<your-org>/ghostcrab-mcp
author: Francois Lamotte
license: Apache-2.0
tags:
  - runtime
  - project-management
  - status-tracking
  - knowledge-graph
  - sqlite
  - mcp
requires:
  env: []
openclaw:
  role: both
  slots:
    runtime: ghostcrab-runtime
files: []
---

# GhostCrab Runtime for OpenClaw

This skill gives OpenClaw agents a shared local runtime ledger through
GhostCrab Personal. It does not make GhostCrab the scheduler. OpenClaw still
runs agents and workflows; GhostCrab records durable state, findings, goals, and
relationships so later skill runs can recover context.

## Step Zero: Resolve Transport

GhostCrab Personal runs locally with SQLite and stdio MCP by default:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

If OpenClaw can register stdio MCP servers, configure `command: "gcp"` and
`args: ["brain", "up"]`. If OpenClaw requires HTTP/SSE, run a local bridge that
calls GhostCrab over stdio. Abort runtime writes until one of these paths is
working.

## External Endpoints

| Endpoint | Transport | Data sent | Notes |
| --- | --- | --- | --- |
| local `gcp brain up` process | stdio MCP | task state, findings, graph edges, goals | Default Personal path |
| optional local bridge | HTTP/SSE to bridge, stdio to GhostCrab | same as above | Required only for HTTP-only OpenClaw setups |

## Security and Privacy

- Runtime state is stored locally in GhostCrab Personal's SQLite database.
- No remote endpoint is required for the default setup.
- Bridge deployments should be local-only unless intentionally shared.
- Do not store secrets in findings, facets, or task state.

## Trust Statement

By using this skill, OpenClaw agents write selected runtime state to the
configured GhostCrab Personal process or bridge. Use only a local process or
bridge you control.

## Model Invocation Note

OpenClaw agents call GhostCrab tools when they need runtime continuity:

- `ghostcrab_upsert` for mutable task state
- `ghostcrab_remember` for durable findings and audit notes
- `ghostcrab_learn` for dependencies and conceptual links
- `ghostcrab_project` for active goals and handoffs
- `ghostcrab_pack` for recovery context

## Start Here

Use this three-tool path for a first runtime integration:

1. `ghostcrab_pack`
2. `ghostcrab_upsert`
3. `ghostcrab_remember`

## Lifecycle JTBD

| Moment | Runtime question | GhostCrab tool |
| --- | --- | --- |
| Before | What task context or handoff state already exists? | `ghostcrab_pack` |
| Read | What prior findings affect this action? | `ghostcrab_search` |
| Write durable | What did this agent learn that should not be overwritten? | `ghostcrab_remember` |
| Write state | What task, ticket, phase, or agent status changed? | `ghostcrab_upsert` |
| Link | What depends on or blocks what? | `ghostcrab_learn` |
| After | What goal or next step remains active? | `ghostcrab_project` |
| Recovery | What compact state should a restarted agent load? | `ghostcrab_pack` |

## Runtime Tool Patterns

### Task State

Use `ghostcrab_upsert` for a current-state tracker:

```json
{
  "schema_id": "openclaw:task-state",
  "match": {
    "facets": {
      "record_id": "task:deduplicate-customers"
    }
  },
  "set_content": "Task deduplicate-customers is in review. Last completed step: candidate merge report generated.",
  "set_facets": {
    "record_id": "task:deduplicate-customers",
    "status": "review",
    "owner": "openclaw-agent"
  },
  "create_if_missing": true
}
```

### Findings

Use `ghostcrab_remember` for observations that should remain as history:

```json
{
  "content": "Import batch 2026-05-10 contained three duplicate customer records with matching billing emails.",
  "facets": {
    "record_id": "finding:import-2026-05-10-duplicates",
    "kind": "finding",
    "task": "deduplicate-customers"
  },
  "schema_id": "openclaw:finding"
}
```

### Dependencies

Use `ghostcrab_learn` for graph structure:

```json
{
  "edge": {
    "source": "task:deduplicate-customers",
    "target": "task:approve-merge-policy",
    "label": "blocked_by",
    "weight": 1
  }
}
```

Use `ghostcrab_traverse` when an agent needs to inspect downstream or upstream
impact before acting.

### Active Goals

Use `ghostcrab_project` to leave lightweight goals or handoff steps:

```json
{
  "scope": "openclaw:customer-cleanup",
  "proj_type": "GOAL",
  "status": "active",
  "content": "Review duplicate merge candidates and ask user for approval before applying changes."
}
```

## Orchestrator Pattern

An OpenClaw orchestrator can use GhostCrab as a shared ledger:

1. Load current context with `ghostcrab_pack`.
2. Count work by status with `ghostcrab_count`.
3. Search blockers with `ghostcrab_search`.
4. Traverse dependency links with `ghostcrab_traverse`.
5. Assign or update work with `ghostcrab_upsert`.
6. Record the coordination decision with `ghostcrab_remember`.
7. Leave the next active goal with `ghostcrab_project`.

This is a polling and decision pattern, not a claim that GhostCrab schedules or
restarts agents itself.

## remember vs upsert

Use `ghostcrab_remember` for:

- completed investigation notes
- audit decisions
- evidence discovered by an agent
- final outputs from a step

Use `ghostcrab_upsert` for:

- task status
- owner assignment
- current phase
- retry count
- current blocker summary

When replacing meaningful state, preserve the transition reason in content so a
future agent can recover why the state changed.

## Workspace Rule

Before creating a workspace for runtime state, call `ghostcrab_workspace_list`.
Only call `ghostcrab_workspace_create` if the workspace is missing.

## Failure Modes

| Failure | Required behavior |
| --- | --- |
| Transport not configured | Abort with "GhostCrab transport is not configured; configure stdio MCP or a local bridge." |
| `ghostcrab_status` unavailable | Ask the user to run `gcp brain up` |
| `ghostcrab_pack` empty | Continue with empty context, then list workspaces before creating one |
| Bridge timeout | Mark the OpenClaw step as memory-not-written and retry if state is critical |
| Ambiguous task state | Ask for or derive a stable `record_id` before `ghostcrab_upsert` |

## Verification

Verify tool availability, then run:

1. `ghostcrab_pack` for the current project.
2. `ghostcrab_upsert` a harmless `task:test-ghostcrab-runtime` state.
3. `ghostcrab_remember` a test finding.
4. `ghostcrab_search` for the finding.
5. `ghostcrab_count` grouped by `status` if task-state facets are present.

## Short PRO Note

This skill focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO /
mindBrain Pro is the PostgreSQL-based option for centralized team deployment.
