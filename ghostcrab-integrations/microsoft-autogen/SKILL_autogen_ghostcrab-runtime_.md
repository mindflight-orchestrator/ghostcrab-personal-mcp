# SKILL: AutoGen Runtime with GhostCrab Personal

Purpose: map AutoGen runtime concepts to GhostCrab Personal MCP tools without turning GhostCrab into an AutoGen scheduler.

Personal runtime defaults:

- `@mindflight/ghostcrab-personal-mcp`
- `gcp brain up`
- local SQLite
- stdio transport
- AutoGen connection through `McpWorkbench(StdioServerParams(...))`

## Runtime Boundary

AutoGen orchestrates the agents. GhostCrab stores the state they share. GhostCrab does not dispatch agents, prioritize speakers, pause or resume agents, or decide who talks next.

Use AutoGen for:

- team topology
- turn selection
- termination conditions
- model calls
- tool reflection

Use GhostCrab for:

- active goals and constraints with `ghostcrab_project`
- mutable task state with `ghostcrab_upsert`
- durable findings and decisions with `ghostcrab_remember`
- shared context packs with `ghostcrab_pack`
- graph links with `ghostcrab_learn`

## Runtime Tool Mapping

| AutoGen runtime need | GhostCrab tool | Pattern |
| --- | --- | --- |
| Agent joins a run | `ghostcrab_pack` | Load active context by workspace and task. |
| Planner sets goal | `ghostcrab_project` | Store active goal or constraint. |
| Executor claims task | `ghostcrab_upsert` | Mutable record with `status=in_progress`. |
| Executor reports result | `ghostcrab_upsert` | Same record with `status=complete` or `blocked`. |
| Reviewer stores finding | `ghostcrab_remember` | Durable, not overwritten. |
| Agent links dependency | `ghostcrab_learn` | Edge from task to blocker, source, or decision. |
| Orchestrator checks progress | `ghostcrab_count`, `ghostcrab_search`, `ghostcrab_pack` | AutoGen then decides the next speaker. |

## Connection

```python
from autogen_ext.tools.mcp import McpWorkbench, StdioServerParams

params = StdioServerParams(command="gcp", args=["brain", "up"])

async with McpWorkbench(params) as workbench:
    tools = await workbench.list_tools()
    print([tool["name"] for tool in tools if tool["name"].startswith("ghostcrab_")])
```

## Worker Prompt

```python
WORKER_SYSTEM_MESSAGE = """
You are an AutoGen worker. AutoGen controls turn order; GhostCrab stores shared state.

Before work:
- Call ghostcrab_pack with the workspace, task id, and your role.
- If the pack is empty and this is not a new run, call ghostcrab_search with exact workspace/task facets.

During work:
- Use ghostcrab_upsert for mutable task state.
- Use ghostcrab_remember only for stable findings or decisions.
- Use ghostcrab_learn for blockers, dependencies, and evidence links.

Never claim that GhostCrab scheduled you or selected the next speaker.
"""
```

## Planner Runtime

```python
async def planner_start(workbench, workspace_id: str, run_id: str, goal: str) -> None:
    await workbench.call_tool(
        "ghostcrab_project",
        {
            "scope": workspace_id,
            "proj_type": "GOAL",
            "content": f"Run {run_id} goal: {goal}",
            "status": "active",
            "activity_family": "software-delivery",
        },
    )
    await workbench.call_tool(
        "ghostcrab_remember",
        {
            "content": f"Planner decision for run {run_id}: {goal}",
            "facets": {
                "workspace": workspace_id,
                "run_id": run_id,
                "role": "planner",
                "kind": "decision",
            },
        },
    )
```

## Executor Runtime

```python
async def executor_claim(workbench, workspace_id: str, run_id: str, task_id: str) -> None:
    await workbench.call_tool(
        "ghostcrab_upsert",
        {
            "schema_id": "autogen_task_state",
            "match": {"facets": {"record_id": f"task:{task_id}"}},
            "set_content": f"Task {task_id} claimed by executor in run {run_id}.",
            "set_facets": {
                "record_id": f"task:{task_id}",
                "workspace": workspace_id,
                "run_id": run_id,
                "status": "in_progress",
                "assignee": "executor",
            },
            "create_if_missing": True,
        },
    )
```

```python
async def executor_complete(workbench, workspace_id: str, run_id: str, task_id: str, summary: str) -> None:
    await workbench.call_tool(
        "ghostcrab_upsert",
        {
            "schema_id": "autogen_task_state",
            "match": {"facets": {"record_id": f"task:{task_id}"}},
            "set_content": f"Task {task_id} complete. {summary}",
            "set_facets": {
                "record_id": f"task:{task_id}",
                "workspace": workspace_id,
                "run_id": run_id,
                "status": "complete",
            },
            "create_if_missing": True,
        },
    )
```

## Reviewer Runtime

```python
async def reviewer_record(workbench, workspace_id: str, run_id: str, task_id: str, finding: str) -> None:
    prior = await workbench.call_tool(
        "ghostcrab_search",
        {
            "query": "prior reviewer decisions",
            "filters": {"workspace": workspace_id, "task_id": task_id},
            "limit": 5,
        },
    )
    await workbench.call_tool(
        "ghostcrab_remember",
        {
            "content": f"Reviewer finding for {task_id}: {finding}",
            "facets": {
                "workspace": workspace_id,
                "run_id": run_id,
                "task_id": task_id,
                "role": "reviewer",
                "kind": "finding",
                "prior_checked": bool(prior),
            },
        },
    )
```

## Graph Runtime

```python
async def link_blocker(workbench, task_id: str, blocker_id: str, workspace_id: str) -> None:
    await workbench.call_tool(
        "ghostcrab_learn",
        {
            "edge": {
                "source": f"task:{task_id}",
                "target": f"blocker:{blocker_id}",
                "label": "blocked_by",
                "properties": {"workspace": workspace_id},
            }
        },
    )
```

## Orchestrator Read Loop

The AutoGen orchestrator can read state, but the selection decision remains AutoGen logic.

```python
async def read_runtime_state(workbench, workspace_id: str) -> dict:
    pack = await workbench.call_tool(
        "ghostcrab_pack",
        {"query": "active goals blockers incomplete tasks", "scope": workspace_id, "limit": 10},
    )
    counts = await workbench.call_tool(
        "ghostcrab_count",
        {
            "schema_id": "autogen_task_state",
            "group_by": ["status"],
            "filters": {"workspace": workspace_id},
        },
    )
    return {"pack": pack, "counts": counts}
```

## Lifecycle JTBD

Planner: `ghostcrab_pack` -> `ghostcrab_project` -> `ghostcrab_remember`

Executor: `ghostcrab_pack` -> `ghostcrab_upsert` -> `ghostcrab_remember`

Reviewer: `ghostcrab_search` -> `ghostcrab_remember`

Keep demos short. The recommended runtime smoke test is `ghostcrab_pack` -> `ghostcrab_remember` -> `ghostcrab_pack` -> `ghostcrab_upsert`.

## Failure Modes

Pack empty for joining agent: call `ghostcrab_search` with exact workspace, run, and task facets. If that is also empty, treat as cold start.

AutoGen termination before writes: add an explicit final reviewer or orchestrator turn that verifies `ghostcrab_count` before shutdown.

Parallel teams: include `run_id` in facets. Do not share a `record_id` across independent runs unless overwrite is intended.

Tool-call failures: keep the workbench context open for the whole team run and verify tool names with `workbench.list_tools()` at startup.
