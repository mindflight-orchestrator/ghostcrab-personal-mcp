# Skill: GhostCrab Personal + OpenAI Agents SDK

**Scope:** Integrate the OpenAI Agents SDK with GhostCrab Personal as a local MCP memory layer. The default path is **SQLite local state**, launched with `gcp brain up`, connected through `MCPServerStdio`.

GhostCrab Personal is not an alternative agent runtime. It is the shared, queryable context layer that lets separate SDK runs and agents see the same durable facts, current state, graph links, and workspace model.

---

## Start Here: Local MCPServerStdio

Use the Personal package and let the SDK start the local MCP process over stdio.

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
```

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

ghostcrab = MCPServerStdio(command="gcp", args=["brain", "up"])
agent = Agent(name="my-agent", mcp_servers=[ghostcrab])
```

For most local workflows this is the whole transport story: no hosted service, no database DSN, no HTTP endpoint. `gcp brain up` opens the GhostCrab Personal MCP server with local SQLite-backed memory and stdio as the default transport.

Use a lifecycle block when running real work:

```python
async with MCPServerStdio(command="gcp", args=["brain", "up"]) as ghostcrab:
    agent = Agent(
        name="ResearchAgent",
        instructions=AGENT_INSTRUCTIONS,
        mcp_servers=[ghostcrab],
    )
    result = await Runner.run(agent, "Summarize the current workspace state")
```

---

## First Contact Tool Set

Keep the first contact small. Give the model only the tools it needs to orient, retrieve, and write safely.

| Need | Tool |
|---|---|
| Runtime and routing check | `ghostcrab_status` |
| List existing workspaces before creating anything | `ghostcrab_workspace_list` |
| Create a workspace only when absent | `ghostcrab_workspace_create` |
| Build a compact context pack | `ghostcrab_pack` |
| Retrieve facts | `ghostcrab_search` |
| Store durable observations | `ghostcrab_remember` |
| Update current state records | `ghostcrab_upsert` |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. OpenAI Agents using `MCPServerStdio` can pass `mode="hybrid"` in `ghostcrab_search` arguments as soon as embeddings are enabled.

When a new workspace is needed, always call `ghostcrab_workspace_list` first. Only call `ghostcrab_workspace_create` after confirming the target workspace is missing.

---

## Recommended Agent Instructions

```python
AGENT_INSTRUCTIONS = """
You have access to GhostCrab Personal, a local SQLite-backed MCP memory layer.

Start here:
1. Call ghostcrab_status to verify the local memory server is reachable.
2. Call ghostcrab_pack for the task and workspace scope.
3. Use ghostcrab_search when you need specific prior facts.
4. Use ghostcrab_remember for durable findings.
5. Use ghostcrab_upsert for current state records that should be replaced in place.

Memory rule:
- remember = append a durable fact, decision, source note, or observation.
- upsert = update the latest state of a named run, task, project, or tracker.

Workspace rule:
- call ghostcrab_workspace_list before ghostcrab_workspace_create.
- do not create duplicate workspaces with similar labels.
"""
```

---

## Lifecycle JTBD

Use this run lifecycle for SDK agents that need memory continuity.

| Moment | Job | GhostCrab tools |
|---|---|---|
| Before run | Verify availability and hydrate compact context | `ghostcrab_status`, `ghostcrab_pack` |
| Read during run | Retrieve specific facts or records | `ghostcrab_search`, `ghostcrab_count` |
| Write durable | Store facts that should remain historically true | `ghostcrab_remember` |
| Write current state | Replace a tracker, run status, or latest summary | `ghostcrab_upsert` |
| Relate concepts | Link entities, blockers, dependencies, handoffs | `ghostcrab_learn`, `ghostcrab_traverse` |
| After run | Record progress or next step | `ghostcrab_project`, `ghostcrab_upsert` |
| Recovery | Rebuild working memory after restart | `ghostcrab_pack`, then `ghostcrab_search` |

## Agent Performance Contract

1. Keep `MCPServerStdio` as the default GhostCrab path. Do not introduce a bridge unless the deployment actually needs one.
2. Start each run with `ghostcrab_status` and `ghostcrab_pack`; this is safer than expanding old conversation state into the prompt.
3. Use `ghostcrab_remember` for evidence and `ghostcrab_upsert` for current state. For upserts, always provide a stable `record_id`.
4. Use tool filters to expose only the GhostCrab tools a given agent role needs.
5. End with `ghostcrab_project` so a later `Runner.run()` gets a crisp handoff instead of a stale transcript.

Example SDK-level write split:

```python
REMEMBER_THIS = """
Call ghostcrab_remember when you discover a stable fact:
content='The ingestion job failed because invoice_date is missing from May CSV rows.'
facets={'workspace_id': 'acme-demo', 'kind': 'finding', 'source': 'sdk-run'}

Call ghostcrab_upsert when updating latest state:
match={'facets': {'record_id': 'run:invoice-import:latest'}}
set_content='Latest invoice import run is blocked on missing invoice_date.'
set_facets={'status': 'blocked', 'workspace_id': 'acme-demo'}
"""
```

---

## Tool Filtering

Use SDK tool filtering to keep early runs predictable.

```python
from agents.mcp import create_static_tool_filter

memory_filter = create_static_tool_filter(
    allowed_tool_names=[
        "ghostcrab_status",
        "ghostcrab_pack",
        "ghostcrab_search",
        "ghostcrab_remember",
        "ghostcrab_upsert",
    ]
)

ghostcrab = MCPServerStdio(
    command="gcp",
    args=["brain", "up"],
    cache_tools_list=True,
    tool_filter=memory_filter,
)
```

Broaden the filter only when the workflow needs workspaces, schemas, graph traversal, or model export.

---

## Context Routing

When several SDK runs share one local GhostCrab instance, pass workspace and agent identity in the SDK context and mirror it into tool arguments or MCP metadata when your SDK version supports `tool_meta_resolver`.

```python
run_context = {
    "workspace_id": "acme-demo",
    "agent_id": "analyst-01",
    "run_id": "sdk-run-2026-05-10",
}

result = await Runner.run(agent, "Find open blockers", context=run_context)
```

The model should still put `workspace_id`, `agent_id`, or a stable `record_id` in GhostCrab facets when writing records. Facets make later retrieval and exact upserts reliable.

---

## Shared Multi-Agent Pattern

```python
async with MCPServerStdio(command="gcp", args=["brain", "up"], cache_tools_list=True) as ghostcrab:
    analyst = Agent(
        name="Analyst",
        instructions="Read GhostCrab first, then store durable findings with ghostcrab_remember.",
        mcp_servers=[ghostcrab],
    )
    writer = Agent(
        name="Writer",
        instructions="Use ghostcrab_pack and ghostcrab_search before drafting. Update latest report state with ghostcrab_upsert.",
        mcp_servers=[ghostcrab],
    )

    context = {"workspace_id": "acme-demo", "agent_id": "pipeline"}
    analysis = await Runner.run(analyst, "Inspect the current blockers", context=context)
    report = await Runner.run(writer, analysis.final_output, context=context)
```

The first agent writes durable findings. The second agent retrieves them from the same local SQLite memory through GhostCrab tools. No custom session store is required.

---

## Advanced Tools

Use these when the first-contact set is not enough:

| Tool | Use |
|---|---|
| `ghostcrab_schema_list` / `ghostcrab_schema_inspect` | Inspect registered schemas before writing structured records |
| `ghostcrab_project` | Track goals, steps, constraints, and active project progress |
| `ghostcrab_learn` / `ghostcrab_traverse` | Store and follow graph relations such as blockers or dependencies |
| `ghostcrab_workspace_export_model` | Export a workspace model for generators or downstream automation |

Schema registration and ontology design are advanced moves. Prefer provisional workspace records and project notes first; freeze schema only after the pattern is stable.

---

## Failure Modes

| Symptom | What to do |
|---|---|
| `MCPServerStdio` connection fails | Run `gcp brain up` separately in a terminal, confirm it starts, then retry the SDK run. First tool call should be `ghostcrab_status`. |
| `ghostcrab_status` unavailable | Check that `@mindflight/ghostcrab-personal-mcp` is installed and that `gcp` is on `PATH`. |
| `ghostcrab_pack` is empty on first run | This is expected for a new workspace. Proceed, then write durable facts with `ghostcrab_remember`. |
| Search returns too much | Add exact facets such as `workspace_id`, `record_id`, `kind`, or `agent_id`. |
| Upsert creates duplicates | Use a stable `record_id` facet and match under `match.facets`. |

---

## Optional HTTP Bridge

OpenAI Agents SDK does not need HTTP for GhostCrab Personal. Use `MCPServerStdio` by default.

HTTP is only a bridge option when another component requires network MCP, or when a hosted/pro deployment is deliberately introduced. Keep that path outside the Personal quickstart and document the bridge boundary explicitly.

**PRO note:** MCP GhostCrab PRO / mindBrain Pro is the centralized PostgreSQL-backed deployment path for teams that need a shared remote service. It is not required for the Personal SQLite workflow above.
