# SKILL: GhostCrab Personal Architect for AutoGen

Purpose: guide an AutoGen architect agent that models a workspace gradually in GhostCrab Personal without starting from hard schema registration.

Personal defaults:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Start command: `gcp brain up`
- Storage: local SQLite
- Transport: stdio
- AutoGen MCP path: `McpWorkbench` plus `StdioServerParams`

PRO note: MCP GhostCrab PRO / mindBrain Pro can centralize a mature model later. This skill starts with Personal SQLite and provisional workspace modeling.

## Architecture Boundary

AutoGen runs the architect conversation. GhostCrab stores the workspace model, facts, graph links, and recovery context. GhostCrab does not decide which AutoGen agent speaks next.

## First Step: Provisional Workspace

Do not begin by registering a hard schema. Start by checking workspace inventory, then create or reuse one workspace.

```python
async def ensure_architecture_workspace(workbench, workspace_id: str) -> None:
    existing = await workbench.call_tool("ghostcrab_workspace_list", {})
    if workspace_id not in str(existing):
        await workbench.call_tool(
            "ghostcrab_workspace_create",
            {
                "id": workspace_id,
                "label": workspace_id.replace("-", " ").title(),
                "description": "Provisional GhostCrab Personal workspace for AutoGen architecture modeling.",
            },
        )
```

Then capture provisional goals and constraints with `ghostcrab_project`.

```python
await workbench.call_tool(
    "ghostcrab_project",
    {
        "scope": "autogen-architecture",
        "proj_type": "GOAL",
        "content": "Model the service ownership and deployment workflow before deciding whether a schema is needed.",
        "status": "active",
        "provisional": True,
        "activity_family": "software-delivery",
    },
)
```

## Connection

```python
from autogen_ext.tools.mcp import McpWorkbench, StdioServerParams

server_params = StdioServerParams(command="gcp", args=["brain", "up"])

async with McpWorkbench(server_params) as workbench:
    await ensure_architecture_workspace(workbench, "autogen-architecture")
```

## Architect Agent Prompt

```python
ARCHITECT_SYSTEM_MESSAGE = """
You are an AutoGen architecture agent using GhostCrab Personal.

Your order of operations:
1. Call ghostcrab_workspace_list.
2. Call ghostcrab_workspace_create only if the workspace is missing.
3. Use ghostcrab_pack to load prior architectural context.
4. Use ghostcrab_project for provisional goals and constraints.
5. Use ghostcrab_remember for stable architectural decisions and reviewer findings.
6. Use ghostcrab_upsert for mutable task or model-building status.
7. Use ghostcrab_learn for service, task, blocker, and evidence links.
8. Inspect schemas only when needed with ghostcrab_schema_list or ghostcrab_schema_inspect.

Do not start with hard schema registration. Do not invent GhostCrab tool names.
AutoGen controls the conversation; GhostCrab stores shared state.
"""
```

## Lifecycle JTBD

Planner architect:

- `ghostcrab_pack` to load current architecture context.
- `ghostcrab_project` to record active modeling goals.
- `ghostcrab_remember` to save stable architecture decisions.

Executor architect:

- `ghostcrab_pack` to recover task context.
- `ghostcrab_upsert` to update current modeling task state.
- `ghostcrab_learn` to link entities, tasks, blockers, and evidence.

Reviewer architect:

- `ghostcrab_search` to find prior decisions.
- `ghostcrab_remember` to record approval or critique.

## Modeling Pattern

Stable decision:

```python
await workbench.call_tool(
    "ghostcrab_remember",
    {
        "content": "Architecture decision: keep service ownership separate from deployment ownership.",
        "facets": {
            "workspace": "autogen-architecture",
            "kind": "architecture_decision",
            "area": "ownership",
        },
    },
)
```

Mutable modeling task:

```python
await workbench.call_tool(
    "ghostcrab_upsert",
    {
        "schema_id": "architecture_task_state",
        "match": {"facets": {"record_id": "task:model-service-ownership"}},
        "set_content": "Modeling service ownership. Status: in_progress.",
        "set_facets": {
            "record_id": "task:model-service-ownership",
            "workspace": "autogen-architecture",
            "status": "in_progress",
        },
        "create_if_missing": True,
    },
)
```

Graph link:

```python
await workbench.call_tool(
    "ghostcrab_learn",
    {
        "edge": {
            "source": "service:billing-api",
            "target": "team:platform",
            "label": "owned_by",
            "properties": {"workspace": "autogen-architecture"},
        }
    },
)
```

Model inspection:

```python
schemas = await workbench.call_tool("ghostcrab_schema_list", {"summary_only": True})
```

Export when a downstream generator needs the workspace model:

```python
model = await workbench.call_tool(
    "ghostcrab_workspace_export_model",
    {"workspace_id": "autogen-architecture", "depth": "tables_and_columns"},
)
```

## Recommended Next Step

Use at most four tools for the first architect demo:

1. `ghostcrab_workspace_list`
2. `ghostcrab_pack`
3. `ghostcrab_project`
4. `ghostcrab_remember`

Add `ghostcrab_upsert` when the demo needs mutable task state. Add `ghostcrab_learn` when the demo needs graph edges.

## Failure Modes

Pack empty for a new architect agent: use `ghostcrab_search` with workspace facets as fallback. If still empty, treat it as a cold start and create a provisional goal.

Premature schema freeze: if the agent tries to hard-code entity types before the domain is clear, redirect it to `ghostcrab_project` and `ghostcrab_remember` until stable patterns emerge.

Concurrent modeling: include a run id or model version in `ghostcrab_upsert` facets when multiple AutoGen teams model the same workspace.

Missing tools: call `workbench.list_tools()` and confirm the real `ghostcrab_*` names before letting the architect run.
