---
name: GhostCrab MCP - Structured Agent Work
version: 2.0
description: |
  Use GhostCrab Personal when an MCP-capable agent needs local durable memory,
  project state, blockers, dependency links, and compact recovery context.
  Applies to Hermes-Agent, Claude Code, Codex, and other MCP clients.
triggers:
  - "initialize ghostcrab"
  - "load working context"
  - "capture this session"
  - "remember this project note"
  - "what is blocking"
  - "next action"
  - "structure a project"
  - "dependencies"
  - "blockers"
  - "resume context"
  - "search project memory"
---

# GhostCrab MCP - Structured Agent Work

## Overview

GhostCrab Personal is a local MCP memory server for agents. It stores durable
facts, current project state, and graph relationships in MindBrain Personal
SQLite, then exposes them through public `ghostcrab_*` tools.

Default local setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Default transport is local `stdio`. No hosted service is required for the first
trial.

## Start Here

Use this four-tool path for first contact:

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_remember`
4. `ghostcrab_search`

Run `ghostcrab_status` first. If GhostCrab is unavailable, stop and ask the user
to run `gcp brain up`.

If `ghostcrab_pack` returns empty, treat it as a normal first run. Continue with
the task, then use `ghostcrab_remember` to store one useful project note and
`ghostcrab_search` to verify it can be found.

## MCP Client Configuration

For any MCP client that accepts a server command:

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

Use the same command for Hermes-Agent, Claude Code, Codex, or another local MCP
client. Client-specific file locations differ, but the GhostCrab command does
not.

## When To Use

Use GhostCrab when the agent needs any of these:

- project notes that survive chat sessions
- current task or blocker state
- dependency links between tasks, artifacts, people, or decisions
- compact recovery context at session start
- faceted search across prior work
- a handoff record for another agent or future session

Do not use it for one-off answers that do not need durable state.

## Workspace Flow

For an existing project:

1. `ghostcrab_status`
2. `ghostcrab_workspace_list`
3. Select the project workspace
4. `ghostcrab_pack`

For a new project:

1. `ghostcrab_status`
2. `ghostcrab_workspace_list`
3. `ghostcrab_workspace_create`
4. `ghostcrab_pack`

Always list workspaces before creating one. Create a workspace once per project,
not once per chat session.

## Remember vs Upsert

Use `ghostcrab_remember` for durable facts or observations. These are append-style
records you may want to audit later.

Examples:

- project note
- decision rationale
- source observation
- user preference
- completed task result

```text
ghostcrab_remember(
  workspace_id="website-redesign",
  content="The checkout migration must preserve legacy coupon behavior.",
  facets={
    "record_type": "project_note",
    "source": "coding_session"
  }
)
```

Use `ghostcrab_upsert` for mutable current state. The same logical record should
be updated in place.

Examples:

- blocker status
- current task state
- active milestone
- latest owner
- review state

```text
ghostcrab_upsert(
  workspace_id="website-redesign",
  schema_id="project:state",
  match={ "facets": { "record_id": "blocker:coupon-parity" } },
  create_if_missing=true,
  set_content="Coupon parity is blocked on missing production examples.",
  set_facets={
    "record_id": "blocker:coupon-parity",
    "record_type": "blocker",
    "status": "active",
    "severity": "high"
  }
)
```

Preserve important transition rationale with `ghostcrab_remember` before replacing
state with `ghostcrab_upsert`.

## Core Tools

| Need | Tool |
| --- | --- |
| Check runtime health | `ghostcrab_status` |
| List existing workspaces | `ghostcrab_workspace_list` |
| Create a project workspace | `ghostcrab_workspace_create` |
| Load recovery context | `ghostcrab_pack` |
| Search prior memory | `ghostcrab_search` |
| Store durable fact | `ghostcrab_remember` |
| Update current state | `ghostcrab_upsert` |
| Count by status, owner, type, or phase | `ghostcrab_count` |
| Link dependencies or blockers | `ghostcrab_learn` |
| Traverse relationships | `ghostcrab_traverse` |
| Record active goals or constraints | `ghostcrab_project` |
| Inspect schema contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Export a workspace model | `ghostcrab_workspace_export_model` |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. Generic MCP clients do not need different code; agents should read the response note to understand the active mode.

## Using ghostcrab_project

Use `ghostcrab_project` to leave a compact heartbeat for future sessions. It is
not only a table entry; it is the small active context the next agent should see.

Example after a coding session:

```text
ghostcrab_project(
  scope="website-redesign",
  proj_type="STEP",
  status="active",
  content="Next session should compare the new checkout coupon tests with production coupon examples.",
  weight=0.8
)
```

Use `proj_type="CONSTRAINT"` for active constraints and `proj_type="GOAL"` for
the current objective.

## Lifecycle

| Moment | Agent behavior |
| --- | --- |
| Before | `ghostcrab_status`, workspace selection, `ghostcrab_pack` |
| Read | `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_traverse` |
| Write | `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn` |
| After | `ghostcrab_project` plus final current-state `ghostcrab_upsert` |
| Recovery | Start the next session with `ghostcrab_pack` before broad search |

## Agent Performance Contract

1. Treat GhostCrab as durable workbench memory, not as another chat transcript. Read with `ghostcrab_pack` before asking for recap.
2. Store reusable facts with `ghostcrab_remember`; update current task, blocker, or review state with `ghostcrab_upsert`.
3. When a task is blocked, call `ghostcrab_learn` to connect the blocker to the affected record.
4. Prefer narrow `ghostcrab_search` queries after the pack; broad search is for discovery, not first recovery.
5. Finish a work session with `ghostcrab_project` so the next agent gets a clear goal, constraint, or next step.

## Common Patterns

### Resume a coding session

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_search` for the relevant module or task
4. Continue from the recovered facts and active step

### Track a blocker

1. `ghostcrab_upsert` the blocker as current state
2. `ghostcrab_learn` the blocked task relationship
3. `ghostcrab_project` an active constraint for the next session

### Capture a session

1. `ghostcrab_remember` the durable findings
2. `ghostcrab_upsert` the current task or blocker state
3. `ghostcrab_project` the next goal, step, or constraint

## Failure Modes

| Situation | Agent response |
| --- | --- |
| `ghostcrab_status` is unhealthy or unavailable | Stop GhostCrab actions and tell the user to run `gcp brain up`. |
| Workspace does not exist | Call `ghostcrab_workspace_create` after `ghostcrab_workspace_list`. |
| `ghostcrab_pack` is empty | Treat as first run, not failure. Continue and write useful memory. |
| `ghostcrab_search` returns empty | Adjust query or facets; do not claim the whole workspace is empty from one miss. |
| Schema is missing | Continue with clear facets or inspect schemas with `ghostcrab_schema_list`. |
| Current state conflicts | Use stable `record_id` selectors with `ghostcrab_upsert`; preserve rationale with `ghostcrab_remember`. |

## Privacy and Local-First Notes

GhostCrab Personal keeps the first trial local in SQLite. This is useful when the
agent is working with private project context, internal decisions, or personal
organization data.

## PRO Note

This skill focuses on GhostCrab Personal SQLite. PostgreSQL is the PRO path for
teams that later need centralized deployment, shared infrastructure, or higher
throughput.
