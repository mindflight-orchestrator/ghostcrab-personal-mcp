# Skill: GhostCrab Runtime for OpenAI Agents SDK

**Scope:** Operational patterns for OpenAI Agents SDK agents that use GhostCrab Personal as local shared memory. Use this after the main SDK integration skill is in place.

The runtime contract is simple: SDK agents execute tasks; GhostCrab Personal stores shared memory and current state in local SQLite through MCP tools.

---

## Start Here

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(command="gcp", args=["brain", "up"], cache_tools_list=True) as ghostcrab:
    agent = Agent(
        name="RuntimeWorker",
        instructions=RUNTIME_INSTRUCTIONS,
        mcp_servers=[ghostcrab],
    )
    result = await Runner.run(agent, "Continue project acme-demo", context={"workspace_id": "acme-demo"})
```

The first tool sequence for a runtime worker is:

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_search` when the pack is insufficient
4. `ghostcrab_remember` for durable findings
5. `ghostcrab_upsert` or `ghostcrab_project` for latest state and progress

---

## Runtime Tool Map

| Runtime need | GhostCrab Personal tool |
|---|---|
| Check server health and routing | `ghostcrab_status` |
| Rehydrate working memory | `ghostcrab_pack` |
| Retrieve stored facts | `ghostcrab_search` |
| Count records by facets | `ghostcrab_count` |
| Store durable findings | `ghostcrab_remember` |
| Update latest task/run state | `ghostcrab_upsert` |
| Track goals, steps, constraints | `ghostcrab_project` |
| Link dependencies or handoffs | `ghostcrab_learn` |
| Follow graph relations | `ghostcrab_traverse` |
| Inspect available schemas | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

Do not invent custom runtime tools. Express liveness pings, progress, blocked tasks, or latest reports as records updated by `ghostcrab_upsert` or project projections created by `ghostcrab_project`.

---

## Remember vs Upsert

Use `ghostcrab_remember` for facts that should remain true as historical evidence:

```text
The payment import failed on 2026-05-10 because column invoice_date was absent.
```

Use `ghostcrab_upsert` for a current-state record that should have one latest value:

```json
{
  "match": {"facets": {"record_id": "task:payment-import"}},
  "set_content": "Payment import is blocked on missing invoice_date.",
  "set_facets": {
    "workspace_id": "acme-demo",
    "status": "blocked",
    "owner": "RuntimeWorker"
  }
}
```

Use `ghostcrab_project` when the state is a goal, step, constraint, or blocker in an active project flow.

---

## Lifecycle JTBD

| Phase | Agent behavior |
|---|---|
| Before | Call `ghostcrab_status`, then `ghostcrab_pack` scoped to the task and workspace. |
| Read | Use `ghostcrab_search` for exact facts, and `ghostcrab_count` for faceted summaries. |
| Work | Execute the task with SDK tools and normal model reasoning. |
| Durable write | Call `ghostcrab_remember` for decisions, findings, source notes, and completed observations. |
| State write | Call `ghostcrab_upsert` for latest task/run status; call `ghostcrab_project` for progress and blockers. |
| Handoff | Use `ghostcrab_learn` to link a task to a blocker, dependency, source, or downstream agent. |
| Recovery | On restart, call `ghostcrab_pack`; if empty, start clean and create the first records. |

---

## Project Runtime Pattern

```python
RUNTIME_INSTRUCTIONS = """
You are an OpenAI Agents SDK worker using GhostCrab Personal.

At the start:
- call ghostcrab_status.
- call ghostcrab_pack with the workspace and task.

During the task:
- use ghostcrab_search before assuming prior state.
- call ghostcrab_remember for stable findings and decisions.
- call ghostcrab_upsert on record_id='task:<slug>' whenever latest status changes.
- call ghostcrab_project for goals, steps, constraints, or blockers.

Never mark a task complete only in the conversation. Persist the latest status with
ghostcrab_upsert and store important evidence with ghostcrab_remember.
"""
```

Suggested current-state facets:

| Facet | Example |
|---|---|
| `record_id` | `task:payment-import` |
| `workspace_id` | `acme-demo` |
| `kind` | `task_state` |
| `status` | `todo`, `in_progress`, `blocked`, `done` |
| `owner` | `RuntimeWorker` |

---

## Knowledge Graph Pattern

Use Graph tools only for durable structure:

```text
1. ghostcrab_search(query="invoice date validation", filters={"workspace_id": "acme-demo"})
2. ghostcrab_remember(content="Invoice import depends on schema validation passing.", facets={...})
3. ghostcrab_learn(edge={"source": "task:invoice-import", "target": "task:schema-validation", "label": "depends_on"})
4. ghostcrab_traverse(start="task:invoice-import", direction="outbound", edge_labels=["depends_on"])
```

Use `ghostcrab_learn` for blockers, dependencies, conceptual links, and managed-agent handoffs. Use `ghostcrab_traverse` when a worker needs to recover why a task is blocked or what depends on it.

---

## Orchestrator Pattern

An SDK orchestrator should read GhostCrab state, then dispatch work. It should not keep the only copy of progress in Python memory.

```python
ORCHESTRATOR_INSTRUCTIONS = """
Before assigning work, call ghostcrab_pack for the workspace.
Use ghostcrab_search with filters kind='task_state' and status='blocked' or 'todo'.
When dispatching, call ghostcrab_upsert on the task record with owner and status.
When a dependency is discovered, call ghostcrab_learn.
When a phase or goal changes, call ghostcrab_project.
"""
```

For workspace setup:

```text
1. ghostcrab_workspace_list
2. if the target workspace is absent, ghostcrab_workspace_create
3. ghostcrab_project to create a provisional goal
4. ghostcrab_upsert for the first current-state tracker
```

---

## Failure Modes

| Failure | Runtime response |
|---|---|
| `MCPServerStdio` cannot connect | Start `gcp brain up` separately, then verify with `ghostcrab_status`. |
| `ghostcrab_pack` returns no context | Treat as a first run. Continue with an empty working set and write useful outputs. |
| `ghostcrab_upsert` cannot find a record | Use `create_if_missing=True` with a stable `record_id` facet. |
| A write fails mid-run | Continue the SDK task if safe, mention the persistence failure in final output, and retry once after `ghostcrab_status`. |
| Search is noisy | Add exact facets and prefer stable `record_id` matches for state records. |

**PRO note:** Centralized PostgreSQL deployment belongs to MCP GhostCrab PRO / mindBrain Pro. Keep Personal runtime guidance on local SQLite and stdio.
