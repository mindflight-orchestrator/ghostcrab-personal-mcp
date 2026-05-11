# smolagents + GhostCrab Personal Quickstart

Minimal example: one `CodeAgent`, memory retrieval with `ghostcrab_pack` and `ghostcrab_search`, and one durable write with `ghostcrab_remember`.

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
```

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. smolagents callbacks do not need code changes; retrieval quality follows the active GhostCrab server mode.

```python
from mcp import StdioServerParameters
from smolagents import CodeAgent, InferenceClientModel, MCPClient, TaskStep

WORKSPACE = "smolagents-quickstart"
TASK = "Find one useful note about this workspace and persist the result."

server = StdioServerParameters(command="gcp", args=["brain", "up"])
model = InferenceClientModel()

with MCPClient(server, structured_output=True) as tools:
    agent = CodeAgent(
        tools=[
            tools["ghostcrab_status"],
            tools["ghostcrab_pack"],
            tools["ghostcrab_search"],
            tools["ghostcrab_remember"],
        ],
        model=model,
        add_base_tools=True,
    )

    tools["ghostcrab_status"]()

    pack = tools["ghostcrab_pack"](query=TASK, scope=WORKSPACE, limit=4)
    matches = tools["ghostcrab_search"](
        query=TASK,
        mode="hybrid",
        limit=4,
        filters={"workspace_id": WORKSPACE},
    )
    if pack or matches:
        agent.memory.steps = [
            TaskStep(
                task=f"GhostCrab context for {WORKSPACE}:\n{pack}\n\nMatches:\n{matches}",
                task_images=[],
            )
        ]
    else:
        agent.memory.steps = []

    result = agent.run(TASK)

    tools["ghostcrab_remember"](
        content=f"Quickstart result: {result}",
        facets={
            "workspace_id": WORKSPACE,
            "kind": "quickstart_result",
            "source": "smolagents",
        },
    )
```

If your smolagents MCP client cannot open stdio servers directly, run `gcp brain up` behind a stdio-to-HTTP MCP bridge and point `MCPClient` at the bridge URL instead.
