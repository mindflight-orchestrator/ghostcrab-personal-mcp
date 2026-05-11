# SKILL: LlamaIndex + GhostCrab Personal

Purpose: help Claude Code, Codex, and LlamaIndex developers connect a Python LlamaIndex workflow to GhostCrab Personal as a local MCP sidecar for durable operational memory.

This skill is Personal-first:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Start command: `gcp brain up`
- Storage: local SQLite
- Transport: stdio by default
- Public MCP tools: `ghostcrab_status`, `ghostcrab_workspace_list`, `ghostcrab_workspace_create`, `ghostcrab_remember`, `ghostcrab_search`, `ghostcrab_upsert`, `ghostcrab_count`, `ghostcrab_learn`, `ghostcrab_traverse`, `ghostcrab_project`, `ghostcrab_pack`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect`, `ghostcrab_workspace_export_model`

PRO note: teams that later need centralized deployment can evaluate MCP GhostCrab PRO / mindBrain Pro. This guide keeps PostgreSQL out of the Personal path.

## Boundary

LlamaIndex retrieves documents. GhostCrab retrieves operational facts.

Never call `ghostcrab_search` for content that belongs in a LlamaIndex index. Use LlamaIndex indexes, retrievers, query engines, and workflows for documents and RAG. Use GhostCrab Personal for workflow decisions, task state, blockers, run summaries, project constraints, and graph links that should survive beyond one LlamaIndex run.

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for GhostCrab's server-side vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. This is still operational-memory retrieval, not a replacement for LlamaIndex document vector search.

## Start Here

Use this three-tool path for the first integration:

1. `ghostcrab_pack` - load compact prior operational context before a workflow run.
2. `ghostcrab_remember` - store a durable workflow decision or finding.
3. `ghostcrab_upsert` - update mutable workflow step or task status.

Before creating a workspace, always inspect existing workspaces:

1. Call `ghostcrab_workspace_list`.
2. Reuse the workspace if it exists.
3. Call `ghostcrab_workspace_create` only when the target workspace is missing.

## How LlamaIndex Calls GhostCrab

LlamaIndex can consume MCP servers through `llama-index-tools-mcp`. For local GhostCrab Personal, run the MCP server as a stdio process.

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
pip install llama-index llama-index-tools-mcp
```

```python
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI
from llama_index.tools.mcp import BasicMCPClient, McpToolSpec

GHOSTCRAB_TOOLS = [
    "ghostcrab_status",
    "ghostcrab_workspace_list",
    "ghostcrab_workspace_create",
    "ghostcrab_pack",
    "ghostcrab_remember",
    "ghostcrab_search",
    "ghostcrab_upsert",
    "ghostcrab_project",
    "ghostcrab_count",
    "ghostcrab_learn",
    "ghostcrab_traverse",
]


async def build_agent() -> FunctionAgent:
    mcp_client = BasicMCPClient("gcp", args=["brain", "up"])
    tool_spec = McpToolSpec(client=mcp_client, allowed_tools=GHOSTCRAB_TOOLS)
    ghostcrab_tools = await tool_spec.to_tool_list_async()

    return FunctionAgent(
        name="workflow_agent",
        tools=[*ghostcrab_tools],
        llm=OpenAI(model="gpt-5-mini"),
        system_prompt=(
            "Use LlamaIndex for document retrieval. Use GhostCrab only for "
            "operational memory: decisions, task state, blockers, and run recovery."
        ),
    )
```

If the project cannot run stdio MCP directly, add a small MCP-to-HTTP bridge and keep the same tool names. Do not replace GhostCrab tools with custom wrappers unless the wrapper faithfully calls the public `ghostcrab_*` MCP tools.

## Tool Mapping

| LlamaIndex need | GhostCrab tool | Rule |
| --- | --- | --- |
| Check runtime and routing | `ghostcrab_status` | Call before durable writes in normal work. |
| Find or create project memory | `ghostcrab_workspace_list`, then `ghostcrab_workspace_create` | List first, create only if missing. |
| Load prior run context | `ghostcrab_pack` | Best first call before an agent run. |
| Search operational history | `ghostcrab_search` | Operational facts only, never document retrieval. |
| Record stable decisions | `ghostcrab_remember` | Immutable enough to preserve as history. |
| Update current step state | `ghostcrab_upsert` | Mutable task, phase, status, output count, or blocker. |
| Track active goals | `ghostcrab_project` | Current goals, constraints, and recovery anchors. |
| Count states | `ghostcrab_count` | Counts by status, phase, owner, or workspace facets. |
| Link tasks and evidence | `ghostcrab_learn` | Durable graph nodes or edges. |
| Follow dependency/evidence chain | `ghostcrab_traverse` | Read graph paths from a known node. |
| Inspect model shape | `ghostcrab_schema_list`, `ghostcrab_schema_inspect`, `ghostcrab_workspace_export_model` | Use when generating or validating structured data. |

## remember vs upsert

Use `ghostcrab_remember` for durable workflow decisions and findings:

```python
await mcp_client.call_tool(
    "ghostcrab_remember",
    {
        "content": "Workflow decision: use ReAct pattern over chain-of-thought prompts for extraction agents.",
        "facets": {
            "workspace": "llamaindex-demo",
            "kind": "decision",
            "workflow": "invoice-extraction",
        },
    },
)
```

Use `ghostcrab_upsert` for mutable workflow state:

```python
await mcp_client.call_tool(
    "ghostcrab_upsert",
    {
        "schema_id": "workflow_state",
        "match": {"facets": {"record_id": "step:invoice-extraction:data-extraction"}},
        "set_content": "Workflow step data-extraction is complete. Output: 847 records.",
        "set_facets": {
            "record_id": "step:invoice-extraction:data-extraction",
            "workspace": "llamaindex-demo",
            "status": "complete",
            "output_records": 847,
        },
        "create_if_missing": True,
    },
)
```

Do not use `remember` for live status that will change. Do not use `upsert` for decisions where the history matters.

## Lifecycle JTBD

| Moment | LlamaIndex job | GhostCrab action |
| --- | --- | --- |
| Before the run | Rehydrate prior operating context. | `ghostcrab_pack` with the workflow goal and workspace scope. |
| During retrieval | Query documents, tools, and indexes. | No GhostCrab call unless operating state is needed. |
| During reasoning | Check prior decisions or blockers. | `ghostcrab_search` for operational facts only. |
| During writeback | Preserve decisions and findings. | `ghostcrab_remember` with concise facets. |
| During progress and recovery | Update task state and active goals. | `ghostcrab_upsert` for step state, `ghostcrab_project` for current goals. |

## Agent Performance Contract

1. Keep the boundary clean: LlamaIndex indexes retrieve documents; GhostCrab retrieves operating memory, decisions, tasks, and workflow state.
2. Call `ghostcrab_pack` before workflow execution; use `ghostcrab_search` only when the pack points to a specific missing operational fact.
3. Write workflow decisions with `ghostcrab_remember`; write current step status with `ghostcrab_upsert` and a stable `record_id`.
4. For parallel workflows, include `workflow_id`, `run_id`, and `step_id` facets so concurrent updates do not overwrite unrelated state.
5. Use `ghostcrab_project` at the end of each workflow run to leave a compact next-run briefing.

## Minimal Workflow Pattern

```python
async def run_with_operational_memory(agent: FunctionAgent, user_msg: str, mcp_client) -> str:
    await mcp_client.call_tool("ghostcrab_status", {})

    workspaces = await mcp_client.call_tool("ghostcrab_workspace_list", {})
    if "llamaindex-demo" not in str(workspaces):
        await mcp_client.call_tool(
            "ghostcrab_workspace_create",
            {
                "id": "llamaindex-demo",
                "label": "LlamaIndex Demo",
                "description": "Operational memory for LlamaIndex workflow runs.",
            },
        )

    pack = await mcp_client.call_tool(
        "ghostcrab_pack",
        {"query": user_msg, "scope": "llamaindex-demo", "limit": 8},
    )

    response = await agent.run(
        user_msg=(
            "Operational context from GhostCrab follows. "
            "Use it only for workflow state, not document retrieval.\n\n"
            f"{pack}\n\nUser request: {user_msg}"
        )
    )

    await mcp_client.call_tool(
        "ghostcrab_upsert",
        {
            "schema_id": "workflow_state",
            "match": {"facets": {"record_id": "run:last:llamaindex-demo"}},
            "set_content": f"Last LlamaIndex workflow run completed for request: {user_msg}",
            "set_facets": {
                "record_id": "run:last:llamaindex-demo",
                "workspace": "llamaindex-demo",
                "status": "complete",
            },
            "create_if_missing": True,
        },
    )

    return str(response)
```

## Failure Modes

Parallel LlamaIndex runs can write the same mutable record. Use a stable `record_id` per workflow step, include the run id in facets when separate runs must coexist, and preserve transition rationale in `set_content` when replacing status.

`ghostcrab_pack` can be empty on the first run. Treat that as a normal cold start, proceed with LlamaIndex retrieval, and store the first durable decision with `ghostcrab_remember`.

If a later run expects context but the pack is empty, fall back to `ghostcrab_search` for operational facts using exact workspace facets before assuming the memory is absent.

If document snippets appear in GhostCrab results, stop and move that content back into the LlamaIndex document index. GhostCrab should store a link, source id, task id, or decision summary, not the document body.

## Recommended Next Step

Build a tiny two-run demo:

1. First run calls `ghostcrab_pack`, receives an empty or sparse pack, then stores one decision with `ghostcrab_remember`.
2. Second run calls `ghostcrab_pack`, sees the decision, and updates a step record with `ghostcrab_upsert`.
3. LlamaIndex continues to own all document retrieval in both runs.
