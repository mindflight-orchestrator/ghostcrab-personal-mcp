# Skill: GhostCrab Personal + smolagents

**Scope:** Connect Hugging Face smolagents to GhostCrab Personal so a `CodeAgent` can recover context, persist useful observations, and share local memory with other agents.

GhostCrab Personal is local-first: install `@mindflight/ghostcrab-personal-mcp`, launch with `gcp brain up`, and use the real `ghostcrab_*` MCP tools backed by local SQLite.

---

## Transport

GhostCrab Personal defaults to stdio. Prefer direct stdio when your smolagents MCP client accepts stdio server parameters:

```python
from mcp import StdioServerParameters
from smolagents import CodeAgent, InferenceClientModel, MCPClient

server = StdioServerParameters(command="gcp", args=["brain", "up"])

with MCPClient(server, structured_output=True) as tools:
    agent = CodeAgent(tools=tools, model=InferenceClientModel())
    agent.run("Check GhostCrab status, then summarize available context.")
```

If your installed smolagents stack only supports network MCP, keep GhostCrab Personal as the stdio source and put a thin stdio-to-HTTP bridge in front of it. Example shape:

```bash
# Bridge command varies by MCP bridge package; the important boundary is:
# HTTP MCP client -> bridge -> stdio command: gcp brain up
mcp-proxy --port 8000 -- gcp brain up
```

```python
bridge_config = {
    "url": "BRIDGE_URL",
    "transport": "YOUR_CLIENT_BRIDGE_TRANSPORT",
}

with MCPClient(bridge_config, structured_output=True) as tools:
    agent = CodeAgent(tools=tools, model=InferenceClientModel())
```

Recommended order:

1. Direct stdio MCP when available.
2. HTTP bridge only when the smolagents MCP client requires a URL.
3. Native HTTP only if your GhostCrab Personal version explicitly documents it.

---

## First Contact: Four Tools

Keep the first agent run small:

| Need | Tool |
|---|---|
| Verify GhostCrab | `ghostcrab_status` |
| Retrieve compact working memory | `ghostcrab_pack` |
| Store durable step findings | `ghostcrab_remember` |
| Update latest run or task state | `ghostcrab_upsert` |

Add `ghostcrab_search` after the first run when the agent needs targeted retrieval. Add `ghostcrab_learn` when managed agents need to record handoffs, blockers, or dependencies.

---

## Lifecycle JTBD

| Moment | smolagents hook | GhostCrab action |
|---|---|---|
| Before run | build initial task memory | `ghostcrab_pack` |
| Each successful step | `step_callbacks` | `ghostcrab_remember` for durable observations |
| Each state change | `step_callbacks` | `ghostcrab_upsert` for latest task/run status |
| Managed-agent handoff | orchestrator code or callback | `ghostcrab_learn` |
| Recovery | before `agent.run()` | `ghostcrab_pack`; empty pack is normal on first run |

The core rule:

- `ghostcrab_remember` appends durable evidence.
- `ghostcrab_upsert` replaces the current state of a stable `record_id`.

## Agent Performance Contract

1. Keep the prompt small. Use `ghostcrab_pack` to inject only the useful recovery briefing, not the whole prior run.
2. In `step_callbacks`, persist only successful or diagnostically useful steps; log GhostCrab errors and let the agent continue rather than crashing the run.
3. Write observations with `ghostcrab_remember`; write latest run, task, or managed-agent state with `ghostcrab_upsert`.
4. Include `run_id`, `agent_name`, `step_index`, and `record_id` metadata so later retrieval can separate evidence from current state.
5. For managed agents, create a `ghostcrab_learn` edge for every handoff that changes responsibility or blocks another agent.

---

## Automatic Persistence with step_callbacks

`step_callbacks` are the right integration point because they preserve smolagents' normal execution model. The callback records successful observations and current run state without changing the task prompt.

```python
from smolagents import ActionStep, CodeAgent

WORKSPACE_ID = "smolagents-demo"
RUN_ID = "run:smolagents-demo:latest"

def persist_step(step: ActionStep, agent: CodeAgent) -> None:
    """Persist useful smolagents step output to GhostCrab Personal."""
    status_tool = agent.tools.get("ghostcrab_status")
    remember = agent.tools.get("ghostcrab_remember")
    upsert = agent.tools.get("ghostcrab_upsert")

    try:
        if status_tool:
            status_tool()

        if step.error is not None:
            if upsert:
                upsert(
                    match={"facets": {"record_id": RUN_ID}},
                    create_if_missing=True,
                    set_content=f"Latest smolagents run failed at step {step.step_number}: {step.error}",
                    set_facets={"workspace_id": WORKSPACE_ID, "kind": "run_state", "status": "failed"},
                )
            return

        if remember and step.observations:
            remember(
                content=str(step.observations),
                facets={
                    "workspace_id": WORKSPACE_ID,
                    "kind": "step_observation",
                    "step_number": step.step_number,
                    "source": "smolagents",
                },
            )

        if upsert:
            upsert(
                match={"facets": {"record_id": RUN_ID}},
                create_if_missing=True,
                set_content=f"Latest successful smolagents step: {step.step_number}",
                set_facets={"workspace_id": WORKSPACE_ID, "kind": "run_state", "status": "running"},
            )
    except Exception as exc:
        # Persistence must not crash the agent's main task.
        print(f"GhostCrab persistence skipped for step {step.step_number}: {exc}")
```

Use the callback when constructing the agent:

```python
agent = CodeAgent(
    tools=tools,
    model=InferenceClientModel(),
    step_callbacks=[persist_step],
)
```

---

## Pre-Run Context Injection

Use `ghostcrab_pack` before `agent.run()` and inject the result into smolagents memory as a `TaskStep` when there is prior context.

```python
from smolagents import TaskStep

def hydrate_memory(agent: CodeAgent, tools, task: str) -> None:
    pack = tools["ghostcrab_pack"](
        query=task,
        scope=WORKSPACE_ID,
        limit=6,
    )
    if not pack:
        agent.memory.steps = []
        return

    agent.memory.steps = [
        TaskStep(task=f"GhostCrab context for {WORKSPACE_ID}:\n{pack}", task_images=[])
    ]
```

An empty pack on the first run is expected. Start with `agent.memory.steps = []`, run the task, and let callbacks create the first durable records.

---

## Managed-Agent Handoffs

When one smolagents agent delegates to another, record the relationship with `ghostcrab_learn` after the handoff is clear.

```python
def record_handoff(tools, source_agent: str, target_agent: str, task_id: str) -> None:
    learn = tools.get("ghostcrab_learn")
    if not learn:
        return
    learn(
        edge={
            "source": f"agent:{source_agent}",
            "target": f"agent:{target_agent}",
            "label": "handoff",
            "properties": {"task_id": task_id, "workspace_id": WORKSPACE_ID},
        }
    )
```

Use graph links for blockers, dependencies, and handoffs. Do not use graph writes for every small step log; use `ghostcrab_remember` for those.

---

## Targeted Retrieval After First Run

Once the workspace has records, let the agent search before acting:

```python
search = tools["ghostcrab_search"](
    query="ingestion blockers",
    filters={"workspace_id": WORKSPACE_ID, "kind": "step_observation"},
    limit=5,
)
```

Use `ghostcrab_pack` for compact recovery and `ghostcrab_search` for a specific question.

---

## Failure Modes

| Failure | Callback behavior |
|---|---|
| GhostCrab tool raises mid-run | Catch the error, log it, and continue the smolagents task without persistence for that step. |
| `ghostcrab_pack` returns empty | Treat it as first run; leave `agent.memory.steps=[]`. |
| Upsert duplicates latest state | Match with `match={"facets": {"record_id": RUN_ID}}`. |
| HTTP bridge dies | Restart the bridge, or switch to direct stdio if supported. Verify with `ghostcrab_status`. |

**PRO note:** Centralized team deployment can use MCP GhostCrab PRO / mindBrain Pro. This skill is for GhostCrab Personal with local SQLite.
