---
name: ghostcrab-architect
version: 1.0.0
description: >
  Advanced OpenClaw skill for shaping GhostCrab Personal workspaces after a
  use case has emerged: provisional memory first, schema inspection second,
  durable model changes only when needed.
homepage: https://www.ghostcrab.be
repository: https://github.com/<your-org>/ghostcrab-mcp
author: Francois Lamotte
license: Apache-2.0
tags:
  - architecture
  - modeling
  - workspace
  - sqlite
  - mcp
  - ghostcrab
requires:
  env: []
openclaw:
  slots:
    architect: ghostcrab-architect
files: []
---

# GhostCrab Architect for OpenClaw

This is an advanced companion skill. Use it after the main GhostCrab memory or
runtime skill has produced enough real usage to show what should be modeled.

Do not begin with a heavy ontology design session. Start with provisional
memory, inspect what exists, then evolve the workspace model only when the
workflow has stabilized.

## Step Zero: Resolve Transport

GhostCrab Personal runs locally with SQLite and stdio MCP by default:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

If OpenClaw supports local stdio MCP, register `gcp brain up` as the MCP server.
If OpenClaw requires HTTP/SSE, use a local MCP-to-HTTP bridge. Do not proceed
with modeling calls until GhostCrab tools are visible.

## External Endpoints

| Endpoint | Transport | Data sent | Notes |
| --- | --- | --- | --- |
| local `gcp brain up` process | stdio MCP | workspace descriptions, schema inspection requests, modeling notes | Default Personal path |
| optional local bridge | HTTP/SSE to bridge, stdio to GhostCrab | same as above | Only when OpenClaw cannot call stdio MCP directly |

## Security and Privacy

- Workspace modeling data remains in local GhostCrab Personal SQLite by default.
- The skill does not require a public GhostCrab URL.
- Bridge mode should stay on localhost unless deliberately exposed.
- Avoid storing secrets in model descriptions or durable notes.

## Trust Statement

By using this skill, OpenClaw sends workspace descriptions and modeling notes to
the configured local GhostCrab process or bridge. Use only infrastructure you
control.

## Model Invocation Note

The agent uses real GhostCrab Personal tools:

- `ghostcrab_pack` to understand the current workspace context
- `ghostcrab_search` to inspect prior modeling decisions
- `ghostcrab_remember` to store durable architecture notes
- `ghostcrab_project` to hold provisional modeling goals
- `ghostcrab_schema_list` and `ghostcrab_schema_inspect` to inspect contracts
- `ghostcrab_workspace_export_model` to export a stable model when needed

## Start Here

Use this first path:

1. `ghostcrab_pack`
2. `ghostcrab_search`
3. `ghostcrab_schema_list`

Only continue to deeper modeling if those tools show a real gap.

## Provisional Memory First

For a new or fuzzy OpenClaw workflow:

1. Use `ghostcrab_pack` to load any existing context.
2. Use `ghostcrab_remember` for stable observations about the domain.
3. Use `ghostcrab_upsert` only for mutable current-state records.
4. Use `ghostcrab_project` for provisional modeling goals and open questions.
5. Delay schema work until repeated records reveal stable fields, states, or
   relationships.

This keeps the workspace useful while avoiding premature structure.

## Schema Inspection After

When patterns stabilize:

1. Call `ghostcrab_schema_list` to see available contracts.
2. Call `ghostcrab_schema_inspect` for relevant schemas.
3. Compare real memory records against the contracts.
4. Use `ghostcrab_workspace_export_model` if another tool needs a public model
   contract.
5. Record the modeling rationale with `ghostcrab_remember`.

This skill does not invent custom tool names or assume direct database access.

## Lifecycle JTBD

| Moment | Architect question | GhostCrab tool |
| --- | --- | --- |
| Before | What domain context already exists? | `ghostcrab_pack` |
| Read | What modeling notes or records already exist? | `ghostcrab_search` |
| Write durable | What architecture decision should be remembered? | `ghostcrab_remember` |
| Write state | What modeling question or workspace state changed? | `ghostcrab_project` or `ghostcrab_upsert` |
| Inspect | What schemas are available and relevant? | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| After | What should future agents do with this model? | `ghostcrab_project` |
| Recovery | What context allows modeling to resume? | `ghostcrab_pack` |

## remember vs upsert

Use `ghostcrab_remember` for architecture decisions:

- "We model orders and shipments separately because one order can split across warehouses."
- "Priority is a facet, not a lifecycle stage."
- "Approval is represented as a linked decision record."

Use `ghostcrab_upsert` for mutable modeling state:

- `modeling-question:order-lifecycle status=open`
- `workspace:onboarding status=needs-schema-review`

## Workspace Rule

Always call `ghostcrab_workspace_list` before `ghostcrab_workspace_create`.
Create a workspace only when the intended workspace is absent.

## Failure Modes

| Failure | Required behavior |
| --- | --- |
| Transport not configured | Abort with a clear transport setup message |
| `ghostcrab_status` unavailable | Ask the user to run `gcp brain up` |
| `ghostcrab_pack` empty | Treat as a new domain; create only after `ghostcrab_workspace_list` confirms absence |
| No matching schema | Continue with provisional memory and record the modeling gap |
| User goal is fuzzy | Ask one clarifying question before storing durable structure |

## Verification

Confirm these tools are available:

```text
ghostcrab_pack
ghostcrab_search
ghostcrab_remember
ghostcrab_project
ghostcrab_schema_list
ghostcrab_schema_inspect
ghostcrab_workspace_export_model
```

Then run a dry modeling pass:

1. Load context with `ghostcrab_pack`.
2. Search prior decisions with `ghostcrab_search`.
3. Inspect schemas with `ghostcrab_schema_list`.
4. Record one architecture note with `ghostcrab_remember`.

## Short PRO Note

This skill focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO /
mindBrain Pro is the PostgreSQL-based option for centralized team deployment.
