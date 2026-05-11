---
name: ghostcrab-architect-adk
version: 2.0
description: |
  Design and initialize a GhostCrab Personal workspace for a Google ADK project.
  Uses @mindflight/ghostcrab-personal-mcp, gcp brain up, local SQLite, stdio MCP,
  and the public ghostcrab_* tools.
triggers:
  - "connect ADK to GhostCrab"
  - "initialize GhostCrab for ADK"
  - "create ADK memory workspace"
  - "bootstrap ADK project memory"
  - "design shared memory for ADK agents"
---

# Skill: GhostCrab Architect for Google ADK

## Purpose

Use this skill when a Google ADK project needs durable local memory before agents
start writing facts, decisions, task state, or blocker relationships.

GhostCrab Personal is the local memory sidecar:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Startup command: `gcp brain up`
- Storage: MindBrain Personal SQLite
- MCP transport: `stdio` by default
- Tool surface: public `ghostcrab_*` MCP tools

Keep the first model small. Start with a workspace and provisional records. Only
stabilize schemas after repeated ADK runs show which entities and relations are
actually useful.

## ADK Session Mapping

Map one ADK project to one GhostCrab `workspace_id`.

Do not create a workspace per ADK `session_id`. Individual ADK sessions, runners,
and sub-agents write into the same project workspace so later sessions can recover
the same context.

Recommended mapping:

| ADK concept | GhostCrab concept | Rule |
| --- | --- | --- |
| ADK app or project | `workspace_id` | One durable workspace per project |
| ADK `session_id` | facet value such as `adk_session_id` | Store as metadata on writes |
| ADK agent name | facet value such as `agent_name` | Use for filtering and handoff |
| ADK run step | current-state record | Update with `ghostcrab_upsert` |

## Setup

Install and start GhostCrab Personal:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Connect ADK through its MCP stdio toolset. The exact import names may vary by ADK
version, but the important part is that ADK launches the `gcp brain up` server over
local stdio instead of requiring a network endpoint.

```python
from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StdioConnectionParams
from mcp.client.stdio import StdioServerParameters

ghostcrab_toolset = MCPToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="gcp",
            args=["brain", "up"],
        ),
        timeout=30,
    )
)

architect_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="ghostcrab_architect",
    instruction="Initialize and maintain the GhostCrab workspace for this ADK project.",
    tools=[ghostcrab_toolset],
)
```

If your MCP client starts servers outside the agent process, configure the same
command in the client:

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

## Required First Sequence

Run this sequence for a new ADK project:

1. Call `ghostcrab_status`.
2. Call `ghostcrab_workspace_list` and look for the project workspace.
3. If it does not exist, call `ghostcrab_workspace_create`.
4. Call `ghostcrab_pack` for the project workspace.

An empty `ghostcrab_pack` on the first session is expected. Continue with the
task and write the first useful facts or state.

## Workspace Bootstrap

Ask only the minimum questions needed to name the workspace and choose useful
facets:

1. What is the ADK project or app name?
2. Which agents or sub-agents will write to shared memory?
3. Which current-state records matter first: task, blocker, phase, artifact, or run?
4. Which durable observations should survive every ADK session?

Then create the workspace if needed:

```text
ghostcrab_workspace_create(
  id="<stable-project-slug>",
  label="<Human project name>",
  description="Shared local memory for Google ADK project <name>"
)
```

Use stable facets on every write:

```json
{
  "workspace_id": "adk-support-agent",
  "facets": {
    "record_id": "adk-run:session-42:task-router",
    "adk_session_id": "session-42",
    "agent_name": "router_agent",
    "record_type": "task_state",
    "status": "in_progress"
  }
}
```

## Lifecycle JTBD

Use the five lifecycle moments in every ADK agent instruction.

| Moment | Agent question | GhostCrab tools |
| --- | --- | --- |
| Before | Is GhostCrab running, and which project workspace should I use? | `ghostcrab_status`, `ghostcrab_workspace_list`, `ghostcrab_workspace_create`, `ghostcrab_pack` |
| Read | What has this project already learned? | `ghostcrab_pack`, `ghostcrab_search`, `ghostcrab_count` |
| Write | What did this session learn or change? | `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn` |
| After | What should the next ADK session resume from? | `ghostcrab_project`, `ghostcrab_upsert` |
| Recovery | What compact briefing restores context after interruption? | `ghostcrab_pack`, `ghostcrab_traverse` |

## Remember vs Upsert

Use `ghostcrab_remember` for durable observations that should remain true as an
append-only record:

```text
ghostcrab_remember(
  workspace_id="adk-support-agent",
  content="The refund policy answer must cite the policy page updated on 2026-04-18.",
  facets={
    "record_type": "decision",
    "adk_session_id": "session-42",
    "agent_name": "policy_agent"
  }
)
```

Use `ghostcrab_upsert` for mutable current state where one record should be
updated in place:

```text
ghostcrab_upsert(
  workspace_id="adk-support-agent",
  schema_id="adk:task-state",
  match={ "facets": { "record_id": "task:refund-routing" } },
  create_if_missing=true,
  set_content="Refund routing task is blocked on missing policy source.",
  set_facets={
    "record_id": "task:refund-routing",
    "record_type": "task_state",
    "status": "blocked",
    "agent_name": "router_agent",
    "adk_session_id": "session-42"
  }
)
```

Use `ghostcrab_learn` when the important thing is a relationship:

```text
ghostcrab_learn(
  edge={
    "source": "task:refund-routing",
    "label": "blocked_by",
    "target": "artifact:refund-policy-source"
  }
)
```

## Optional Schema Discovery

Do not begin by designing a full ontology. When the project has repeated patterns,
inspect available contracts:

1. `ghostcrab_schema_list`
2. `ghostcrab_schema_inspect` for the relevant schema
3. `ghostcrab_workspace_export_model` when another tool needs a model contract

If the needed schema is not registered, keep writing provisional records with
clear `record_type` facets and ask the user whether to formalize the model later.

## Failure Modes

| Situation | Agent behavior |
| --- | --- |
| `ghostcrab_status` reports unavailable | Stop GhostCrab work and tell the user to run `gcp brain up`. Do not fake memory writes in chat. |
| `ghostcrab_workspace_list` does not show the project | Call `ghostcrab_workspace_create` once for the project workspace. |
| `ghostcrab_pack` is empty | Treat as a normal first run. Continue and write the first useful record. |
| `ghostcrab_search` returns no results | Narrow or broaden facets, then continue without claiming the domain is empty. |
| Required schema is missing | Use provisional facets or ask to register a schema later; do not invent tool names. |
| Concurrent ADK sessions update the same state | Use stable `record_id` values with `ghostcrab_upsert` so the latest current state replaces the old one. |

## Handoff Report

End an architect pass with:

- workspace id and label
- ADK sessions or agents expected to write into it
- current-state record types chosen
- durable observation categories chosen
- first `ghostcrab_pack` result, including whether it was empty
- any unresolved modeling question

## PRO Note

This skill targets GhostCrab Personal SQLite. PostgreSQL belongs to the PRO path
for teams that later need centralized deployment or higher-throughput shared
infrastructure.
