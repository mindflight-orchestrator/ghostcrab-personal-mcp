# SKILL: GhostCrab Personal Runtime for LlamaIndex

Purpose: add durable local runtime state to LlamaIndex workflows without replacing LlamaIndex retrieval, indexing, or orchestration.

GhostCrab Personal runtime defaults:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Start command: `gcp brain up`
- Storage: local SQLite
- Transport: stdio
- Runtime tools: `ghostcrab_pack`, `ghostcrab_project`, `ghostcrab_upsert`, `ghostcrab_remember`, `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_learn`, `ghostcrab_traverse`

PRO note: centralized team deployments can use MCP GhostCrab PRO / mindBrain Pro later. Keep the Personal runtime path SQLite-first.

## Runtime Boundary

LlamaIndex runs the workflow. GhostCrab stores shared operational state.

LlamaIndex decides which agent or workflow step executes next. GhostCrab does not dispatch agents, broadcast events, replace workflow context, or decide phase transitions. A LlamaIndex orchestrator may read GhostCrab state and then make its own decision.

## Runtime Actions

| Runtime action | GhostCrab tool | Notes |
| --- | --- | --- |
| Rehydrate a workflow before start | `ghostcrab_pack` | Use compact context from active projections and matching facts. |
| Track active goal, constraint, or blocker | `ghostcrab_project` | Best for current-state project memory. |
| Update task or step state | `ghostcrab_upsert` | Use stable `record_id` facets. |
| Preserve durable decision or finding | `ghostcrab_remember` | Use for history that should not be overwritten. |
| Search prior operational state | `ghostcrab_search` | Operational facts only, not documents. |
| Count workflow states | `ghostcrab_count` | Useful for dashboards and gate checks. |
| Link tasks, sources, blockers | `ghostcrab_learn` | Use graph nodes and edges for durable relationships. |
| Inspect dependency/evidence path | `ghostcrab_traverse` | Read a known graph path. |

## Workspace Startup

Always list before creating:

```python
async def ensure_workspace(mcp_client, workspace_id: str) -> None:
    workspaces = await mcp_client.call_tool("ghostcrab_workspace_list", {})
    if workspace_id not in str(workspaces):
        await mcp_client.call_tool(
            "ghostcrab_workspace_create",
            {
                "id": workspace_id,
                "label": workspace_id.replace("-", " ").title(),
                "description": "Operational runtime memory for LlamaIndex workflows.",
            },
        )
```

## Worker Pattern

Each LlamaIndex worker follows a simple loop: load context, work through LlamaIndex, write operational state.

```python
async def run_worker_step(mcp_client, workspace_id: str, step_id: str, instruction: str):
    pack = await mcp_client.call_tool(
        "ghostcrab_pack",
        {"query": instruction, "scope": workspace_id, "limit": 8},
    )

    await mcp_client.call_tool(
        "ghostcrab_upsert",
        {
            "schema_id": "workflow_state",
            "match": {"facets": {"record_id": f"step:{step_id}"}},
            "set_content": f"Step {step_id} started. Instruction: {instruction}",
            "set_facets": {
                "record_id": f"step:{step_id}",
                "workspace": workspace_id,
                "status": "in_progress",
            },
            "create_if_missing": True,
        },
    )

    return pack
```

When the step produces a stable finding:

```python
await mcp_client.call_tool(
    "ghostcrab_remember",
    {
        "content": "Finding: source invoices use mixed date formats and require normalization before extraction.",
        "facets": {
            "workspace": workspace_id,
            "kind": "finding",
            "step_id": step_id,
        },
    },
)
```

When the step completes:

```python
await mcp_client.call_tool(
    "ghostcrab_upsert",
    {
        "schema_id": "workflow_state",
        "match": {"facets": {"record_id": f"step:{step_id}"}},
        "set_content": "Step completed. Output: 847 records extracted.",
        "set_facets": {
            "record_id": f"step:{step_id}",
            "workspace": workspace_id,
            "status": "complete",
            "output_records": 847,
        },
        "create_if_missing": True,
    },
)
```

## Orchestrator Pattern

The LlamaIndex orchestrator may read GhostCrab state, then decide locally.

```python
async def summarize_runtime(mcp_client, workspace_id: str) -> dict:
    pack = await mcp_client.call_tool(
        "ghostcrab_pack",
        {"query": "active goals blockers and incomplete workflow steps", "scope": workspace_id},
    )
    blocked = await mcp_client.call_tool(
        "ghostcrab_count",
        {
            "schema_id": "workflow_state",
            "group_by": ["status"],
            "filters": {"workspace": workspace_id},
        },
    )
    return {"pack": pack, "counts": blocked}
```

This read does not make GhostCrab the orchestrator. The LlamaIndex workflow uses the returned state to choose its next step.

## Graph Links

Use `ghostcrab_learn` when a task, source, or blocker should be navigable later.

```python
await mcp_client.call_tool(
    "ghostcrab_learn",
    {
        "node": {
            "id": "task:invoice-extraction",
            "label": "Invoice extraction",
            "node_type": "task",
            "properties": {"workspace": workspace_id},
        }
    },
)

await mcp_client.call_tool(
    "ghostcrab_learn",
    {
        "edge": {
            "source": "task:invoice-extraction",
            "target": "source:invoice-batch-042",
            "label": "uses_source",
            "properties": {"workspace": workspace_id},
        }
    },
)
```

Use `ghostcrab_traverse` when a later workflow needs the evidence or dependency path.

## Lifecycle and Recovery

Before: call `ghostcrab_pack` to load active goals, constraints, and prior decisions.

During: call LlamaIndex retrievers and tools for documents. Call GhostCrab only for operational state.

Decision: call `ghostcrab_remember` for stable decisions.

Progress: call `ghostcrab_upsert` for live task or step status.

After: call `ghostcrab_project` for active goals or blockers that should shape the next run.

Recovery: if a run crashes, the next run starts from `ghostcrab_pack`; if the pack is empty, use `ghostcrab_search` with workspace facets before assuming no state exists.

## Failure Modes

Parallel writes: two workflow runs can update the same step record. Use `record_id` values that include the run id when runs are independent; use shared `record_id` only when the newer state should replace the older one.

Cold start: an empty pack is expected for a new workspace. Continue the workflow and create the first operational facts.

Partial completion: if a workflow exits after document retrieval but before status writeback, the next run should search for the last `in_progress` step and either resume it or mark it failed with rationale using `ghostcrab_upsert`.

Over-storing documents: do not save source document bodies in GhostCrab. Store concise operational summaries and identifiers that point back to the LlamaIndex index.

## Runtime Checklist

- `ghostcrab_workspace_list` is called before `ghostcrab_workspace_create`.
- `ghostcrab_pack` is the first runtime read for a workflow.
- `ghostcrab_search` is used only for operational facts.
- `ghostcrab_remember` stores stable decisions or findings.
- `ghostcrab_upsert` updates mutable state with `match.facets.record_id`.
- `ghostcrab_project` records active goals, constraints, and blockers.
- LlamaIndex remains responsible for document retrieval and workflow control.
