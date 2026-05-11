---
name: ghostcrab-mcp
version: 1.0.0
description: >
  Use GhostCrab Personal as a local SQLite-backed MCP memory layer for
  OpenClaw agents: compact context loading, durable observations, mutable task
  state, and linked project knowledge.
homepage: https://www.ghostcrab.be
repository: https://github.com/<your-org>/ghostcrab-mcp
author: Francois Lamotte
license: Apache-2.0
tags:
  - memory
  - sqlite
  - local-first
  - mcp
  - ghostcrab
  - openclaw
requires:
  env: []
openclaw:
  memoryBackend: external
  slots:
    memory: ghostcrab
files: []
---

# GhostCrab Personal for OpenClaw

Use this skill when an OpenClaw agent needs durable local memory across skill
runs. GhostCrab Personal is SQLite-backed and runs locally through MCP. The
default transport is stdio.

## Step Zero: Resolve Transport

Do this before any `ghostcrab_*` tool guidance applies.

### Path A: OpenClaw supports local stdio MCP

Start GhostCrab Personal:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Register GhostCrab as a local stdio MCP server:

```json
{
  "mcp": {
    "servers": {
      "ghostcrab": {
        "command": "gcp",
        "args": ["brain", "up"],
        "transport": "stdio"
      }
    }
  }
}
```

Confirm OpenClaw lists the GhostCrab tools before continuing.

### Path B: OpenClaw requires HTTP or SSE

Do not point OpenClaw directly at GhostCrab Personal as if it served HTTP by
default. Run an MCP-to-HTTP bridge or a custom OpenClaw connector that calls
GhostCrab over stdio, then configure OpenClaw to call that bridge. The bridge is
part of the integration; without it the skill should abort.

## External Endpoints

| Endpoint | Transport | Data sent | Notes |
| --- | --- | --- | --- |
| local `gcp brain up` process | stdio MCP | prompts, memory facts, state updates, graph edges | Default Personal path; data remains local |
| optional local bridge | HTTP/SSE to bridge, stdio to GhostCrab | same as above | Required only when OpenClaw cannot call stdio MCP directly |

## Security and Privacy

- GhostCrab Personal stores data in a local SQLite database.
- The default path does not require a public URL or remote server.
- A bridge should bind to localhost unless you deliberately expose it.
- Secrets should not be written into memory content or facets.
- PostgreSQL belongs to the PRO deployment path, not this Personal default.

## Trust Statement

By using this skill, OpenClaw sends selected task context, memory notes, and
state updates to the configured local GhostCrab MCP process or bridge. Use only
a GhostCrab process or bridge you control.

## Model Invocation Note

The agent calls GhostCrab tools during normal skill execution:

- Before work: load compact context with `ghostcrab_pack`.
- During work: search specific facts with `ghostcrab_search`.
- When producing a durable finding: write `ghostcrab_remember`.
- When changing current task state: write `ghostcrab_upsert`.
- After work: leave active goals or handoff state with `ghostcrab_project`.

## Start Here

Use no more than this first sequence for a new OpenClaw skill:

1. `ghostcrab_pack`
2. `ghostcrab_remember`
3. `ghostcrab_search`

Only add `ghostcrab_upsert`, `ghostcrab_learn`, and other tools when the skill
has an explicit state or graph need.

## Lifecycle JTBD

| Moment | Agent question | GhostCrab tool |
| --- | --- | --- |
| Before | What durable context matters for this skill run? | `ghostcrab_pack` |
| Read | What prior observations or decisions match this question? | `ghostcrab_search` |
| Write durable | What new finding should future runs remember unchanged? | `ghostcrab_remember` |
| Write state | What current task or entity state changed? | `ghostcrab_upsert` |
| After | What goal, handoff, or next step should persist? | `ghostcrab_project` |
| Recovery | What context lets this skill resume after interruption? | `ghostcrab_pack` |

## Agent Performance Contract

1. Resolve transport before any memory claim. If stdio or the bridge is not configured, abort with a clear setup message.
2. Load `ghostcrab_pack` before doing work; an empty pack is not failure, but it should trigger workspace discovery and first-use seeding.
3. Use `ghostcrab_remember` for durable skill findings and `ghostcrab_upsert` for mutable task or skill-run state.
4. Create relation edges with `ghostcrab_learn` as soon as a handoff, blocker, or dependency appears.
5. Record `ghostcrab_project` at the end of a skill invocation so the next OpenClaw skill can continue from a precise goal or constraint.

## Tool Mapping

| OpenClaw need | GhostCrab Personal tool |
| --- | --- |
| Load compact working context | `ghostcrab_pack` |
| Search durable memory | `ghostcrab_search` |
| Store immutable findings | `ghostcrab_remember` |
| Update mutable task or record state | `ghostcrab_upsert` |
| Count items by facet | `ghostcrab_count` |
| Link decisions, tasks, dependencies, or concepts | `ghostcrab_learn` |
| Traverse linked memory | `ghostcrab_traverse` |
| Track active goals | `ghostcrab_project` |
| List workspaces before creating one | `ghostcrab_workspace_list` |
| Create a missing workspace | `ghostcrab_workspace_create` |
| Inspect model contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Export a workspace model | `ghostcrab_workspace_export_model` |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. OpenClaw skills can request `mode="hybrid"` without changing transport; the response note reveals the active retrieval path.

## remember vs upsert

Use `ghostcrab_remember` for immutable skill-run facts:

- "Detected three duplicate customer records in import batch 2026-05-10."
- "Chose provider A because provider B lacked required coverage."
- "User approved the migration plan."

Use `ghostcrab_upsert` for mutable current state:

- `task:deduplicate-customers status=running`
- `task:deduplicate-customers status=done`
- `ticket:abc owner=agent-researcher priority=high`

Prefer a stable `record_id` facet for `ghostcrab_upsert` matches.

## Workspace Rule

Before creating a workspace, always call `ghostcrab_workspace_list`. Create only
when the intended workspace is absent. This prevents duplicate local workspaces
with slightly different names.

## Failure Modes

| Failure | Required behavior |
| --- | --- |
| Transport not configured | Abort the skill with a clear message: configure stdio MCP or run a bridge first |
| `ghostcrab_status` reports unavailable | Ask the user to start GhostCrab with `gcp brain up` |
| `ghostcrab_pack` returns empty | Treat it as a new workspace or new topic; call `ghostcrab_workspace_list` before `ghostcrab_workspace_create` |
| Bridge unavailable | Do not pretend memory writes succeeded; surface the bridge error and continue only if memory is optional |
| Upsert match is ambiguous | Stop and choose a stable `record_id` facet before writing |

## Verification

Ask OpenClaw to list available MCP tools and confirm these names appear:

```text
ghostcrab_status
ghostcrab_workspace_list
ghostcrab_workspace_create
ghostcrab_pack
ghostcrab_search
ghostcrab_remember
ghostcrab_upsert
ghostcrab_project
```

Then run a tiny loop:

1. `ghostcrab_pack` for the current task.
2. `ghostcrab_remember` a harmless test note.
3. `ghostcrab_search` for that test note.

## Short PRO Note

This skill focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO /
mindBrain Pro is the PostgreSQL-based option for centralized team deployment.
