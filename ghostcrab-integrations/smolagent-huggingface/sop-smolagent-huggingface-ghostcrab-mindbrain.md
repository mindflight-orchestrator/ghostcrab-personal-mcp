<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

The most effective pitch for every framework is not to sell MindBrain as an "alternative database" but as a **shared context layer across agents**: today each framework keeps memory in silos; MindBrain/GhostCrab provides a structured, queryable, persistent ontology registry. That argument lands regardless of target framework.

task: target Hugging Face smolagents — explain how integration should be implemented.

Full smolagents architecture review below — integration angles included.

***

## smolagents architecture: anchors for MindBrain

smolagents is Hugging Face’s minimalist framework where **agents author Python**, not rigid JSON plans [^1_1]. Memory is a linear list of steps (`ActionStep`, `TaskStep`) in `agent.memory.steps`, lacking semantic persistence, cross-session continuity, or multi-agent sharing [^1_2]. GhostCrab/MindBrain slots into that vacuum.

***

## Integration vector: native `MCPClient`

smolagents ships MCP (`MCPClient`, `ToolCollection.from_mcp()`) natively since mid‑2025 [^1_3]. GhostCrab is MCP-first, so integrate **without a bespoke wrapper**:

```python
from smolagents import MCPClient, CodeAgent, InferenceClientModel

model = InferenceClientModel("Qwen/Qwen2.5-Coder-32B-Instruct")

with MCPClient(
    {"url": "http://localhost:8000/mcp", "transport": "streamable-http"},
    structured_output=True  # enable JSON schema in tool responses
) as ghostcrab_tools:
    agent = CodeAgent(
        tools=ghostcrab_tools,
        model=model,
        add_base_tools=True
    )
    agent.run("Persist the current processing pipeline state and fetch ingestion module context.")
```

`structured_output=True` matters [^1_3]: the agent sees JSON response schemas ahead of ontology tool calls, improving MCP precision.

***

## Three lifecycle injection points

smolagents offers three seams for external MindBrain context:

**1. Boot-time injection via `agent.memory.steps`**
Hydrate ontology context before first `agent.run()` [^1_2] :

```python
from smolagents import TaskStep

# Fetch context from MindBrain (via GhostCrab or pg_facets)
context = mindbrain_client.get_ontology_context(session_id="pipeline-xyz")

# Hydrate agent memory before the run
agent.memory.steps = [TaskStep(task=context["prior_tasks"], task_images=[])]
agent.run("Resume the pipeline from the prior saved state.")
```

**2. `step_callbacks` — persist each step**
`step_callbacks` fire after each step [^1_2], ideal for streaming observations into MindBrain:

```python
def persist_to_mindbrain(memory_step: ActionStep, agent: CodeAgent) -> None:
    if memory_step.error is None:
        mindbrain_client.upsert_step({
            "session_id": SESSION_ID,
            "step_number": memory_step.step_number,
            "observations": memory_step.observations,
            "tool_calls": memory_step.tool_calls,
        })

agent = CodeAgent(
    tools=ghostcrab_tools,
    model=model,
    step_callbacks=[persist_to_mindbrain]
)
```

**3. Step-by-step control with `agent.step()`**
For long or multi-agent runs, granular stepping lets you **refresh MindBrain between iterations** [^1_2] :

```python
agent.memory.steps.append(TaskStep(task=task, task_images=[]))
while final_answer is None and step_number <= 20:
    memory_step = ActionStep(step_number=step_number, observations_images=[])
    final_answer = agent.step(memory_step)
    
    # Enrich step with ontology registry before next iteration
    ontology_patch = mindbrain_client.get_relevant_context(memory_step.observations)
    memory_step.observations += f"\n[MindBrain context]: {ontology_patch}"
    
    agent.memory.steps.append(memory_step)
    step_number += 1
```


***

## Practical MindBrain value for smolagents

| Native smolagents limits | MindBrain / GhostCrab adds |
| :-- | :-- |
| Ephemeral memory, session-bound [^1_4] | Durable registry across sessions |
| No pipeline-wide context sharing [^1_4] | Shared ontology reachable by every agent |
| Flat step list lacking semantics [^1_1] | Typed entities, relations, facets via GhostCrab |
| No dedupe / compaction primitives [^1_4] | Targeted retrieval via pg_facets + pg_dgraph |


***

## Implementation priority

Fastest POC path:

1. **Expose GhostCrab over HTTP** (`streamable-http`) — connects straight to smolagents `MCPClient`
2. **Ship three MCP tools** sufficient for demos: `context_store`, `context_retrieve`, `entity_link`
3. **Exercise `structured_output=True`** so ontology JSON contracts stay legible

`step_callbacks` is the least invasive first hook — persists bidirectionally without refactoring agent loops.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://github.com/huggingface/smolagents

[^1_2]: https://huggingface.co/docs/smolagents/v1.21.1/tutorials/memory

[^1_3]: https://huggingface.co/docs/smolagents/tutorials/tools

[^1_4]: https://github.com/huggingface/smolagents/issues/901

[^1_5]: https://huggingface.co/docs/smolagents/tutorials/memory

[^1_6]: https://github.com/huggingface/smolagents/issues/1121

[^1_7]: https://starlog.is/articles/ai-agents/huggingface-smolagents

[^1_8]: https://huggingface.co/learn/agents-course/unit2/smolagents/tools

[^1_9]: https://github.com/huggingface/smolagents/issues/2171

[^1_10]: https://github.com/huggingface/smolagents/blob/main/docs/source/en/tutorials/memory.md

[^1_11]: https://www.infoq.com/news/2025/01/hugging-face-smolagents-agents/

[^1_12]: https://ubos.tech/mcp/smolagents/overview/

[^1_13]: https://www.linkedin.com/pulse/agent-memory-smolagents-retain-recall-reflect-vectorizeio-wdlue

[^1_14]: https://huggingface.co/blog/smolagents

[^1_15]: https://github.com/FaustoS88/SmolAgents-MCPs


---

# `skills.md` for Codex + Claude Code — MindBrain + GhostCrab MCP with smolagents

`SKILL_mindbrain_smolagents.md` is ready.

## Outline

Eight production-oriented sections:

1. **Architecture diagram** — ASCII map GhostCrab ↔ smolagents ↔ MindBrain
2. **Minimal GhostCrab contract** — four MCP tools (`context_store`, `context_retrieve`, `entity_link`, `facet_query`) with exact schemas [^2_1]
3. **Native `MCPClient` wiring** — no shim; HF talks straight to GhostCrab [^2_1]
4. **`step_callbacks`** — lowest-touch persistence lane [^2_2]
5. **Pre-run session hydration** via `agent.memory.steps` [^2_2]
6. **Step-loop rehydration** for long horizons [^2_2]
7. **Two-agent canonical pattern** — shared ontology store
8. **Validation checklist** — eight integration gates

Each section ships runnable snippets (not pseudocode).

<div align="center">⁂</div>

[^2_1]: https://huggingface.co/docs/smolagents/tutorials/tools

[^2_2]: https://huggingface.co/docs/smolagents/v1.21.1/tutorials/memory


---

# SKILL: `ghostcrab-runtime` — steering smolagents with MindBrain

> **Audience**: Any smolagents deployment that must read/write coordinated graph state — project ops, collaborative KGs, data-driven supervisors that restart/stop/phase-shift pipelines using `pg_pragma` projections.  
>
> **Runtime handle**: `ghostcrab-runtime` — GhostCrab MCP surfaces that elevate MindBrain into a communal agent brain.

***

## Foundational principle

smolagents handles **execution** (LLM-authored Python plus `ManagedAgent`). MindBrain/GhostCrab holds **truth**: assignments, statuses, timelines, orchestration hints.

Supervisors refuse to hallucinate rollout state — they **consult projections**. Workers hoard no durable checkpoints; they **write MindBrain deltas** whenever a step materially advances work.
```
Orchestrator (CodeAgent)
    │
    ├── reads pg_pragma projections ──► decide: restart / stop / advance phase
    │
    ├── delegates via ManagedAgent ──► Worker A (GhostCrab tools)
    │                                   Worker B (GhostCrab tools)
    │                                   Worker C (GhostCrab tools)
    │
    └── writes supervision decisions to MindBrain
             │
             ▼
      GhostCrab MCP Server
             │
             ▼
        MindBrain (PostgreSQL)
        ├── pg_facets   : faceted entity index
        ├── pg_dgraph   : relation graph
        └── pg_pragma   : materialized projections (aggregated statuses, progress scores)
```


***

## MindBrain data model for supervisors

### Base entities (register in ontology)

```sql
-- Conceptual schema sketch — backed by MindBrain via GhostCrab
entities:
  - project       : {id, name, status, current_phase, created_at}
  - phase         : {id, project_id, name, order, status, started_at, ended_at}
  - task          : {id, phase_id, name, status, assigned_agent, progress_pct, last_updated}
  - knowledge_node: {id, type, content, confidence, source_agent, validated}
  - agent_run     : {id, agent_name, task_id, status, started_at, ended_at, error}

statuts task   : pending | in_progress | blocked | done | failed
statuts phase  : pending | active | completed | aborted
statuts project: planning | executing | review | done | paused
```


### `pg_pragma` projections for orchestrators

`pg_pragma` materializes incremental aggregate views so supervisors read cheap signals instead of full graph scans:

```sql
-- Projection: phase progression
pragma.phase_progress(phase_id) ->
  { total_tasks, done_tasks, failed_tasks, blocked_tasks, completion_pct, can_advance }

-- Projection: overall project health
pragma.project_health(project_id) ->
  { active_agents, stalled_tasks, phase_completion_pct, next_action }

-- Projection: stalled or silent agents
pragma.stalled_agents(threshold_minutes) ->
  [{ agent_name, task_id, last_heartbeat, duration_stalled }]

-- Projection: knowledge graph completeness (collaborative KG)
pragma.kg_coverage(domain) ->
  { total_expected_nodes, indexed_nodes, orphan_nodes, coverage_pct }
```

Those projections are the **sole decision channel** for supervisors — they avoid raw entity scans.

***

## GhostCrab MCP tools (`ghostcrab-runtime` contract)

### Worker tools (state writes)

| MCP tool | Input | Output | Usage |
| :-- | :-- | :-- | :-- |
| `task_status_update` | `task_id`, `status`, `progress_pct`, `notes` | `ok` | Worker reports progress |
| `task_claim` | `task_id`, `agent_name` | `ok \| conflict` | Worker reserves a task |
| `entity_upsert` | `type`, `payload{}`, `tags[]`, `session_id` | `entity_id` | Ontology upsert |
| `entity_link` | `source_id`, `target_id`, `rel`, `weight` | `edge_id` | Create pg_dgraph relation |
| `heartbeat` | `agent_name`, `task_id` | `ok` | Keepalive / liveness proof |
| `agent_run_log` | `agent_name`, `task_id`, `status`, `error?` | `run_id` | Start/end/error journal |

### Supervisor tools (projection reads)

| MCP tool | Input | Output | Usage |
| :-- | :-- | :-- | :-- |
| `phase_progress` | `phase_id` | `{completion_pct, can_advance, blocked}` | Decide whether to advance phases |
| `project_health` | `project_id` | `{next_action, stalled_tasks, ...}` | Global situational snapshot |
| `stalled_agents` | `threshold_minutes` | `[{agent_name, task_id, duration}]` | Detect silent crews to restart |
| `pending_tasks` | `phase_id`, `limit` | `[{task_id, name, priority}]` | Dispatch queue |
| `kg_coverage` | `domain` | `{coverage_pct, orphan_nodes, ...}` | Gauge KG completeness |
| `context_retrieve` | `query`, `session_id`, `top_k` | `[{entity_id, content, score}]` | Pull grounding snippets |


***

## Implementation patterns

### Pattern 1 — Workers: heartbeat + progress pings

Workers lean on `step_callbacks` so MindBrain updates without threading custom bookkeeping through agent code.

```python
from smolagents import ActionStep, CodeAgent, MCPClient

AGENT_NAME = "worker_ingestion"
TASK_ID    = "task-42"

def worker_step_callback(memory_step: ActionStep, agent: CodeAgent) -> None:
    """Standard ghostcrab-runtime worker callback."""
    tools = agent.tools

    # Heartbeat every step
    tools["heartbeat"](agent_name=AGENT_NAME, task_id=TASK_ID)

    if memory_step.error:
        tools["task_status_update"](
            task_id=TASK_ID,
            status="failed",
            progress_pct=memory_step.step_number * 5,  # estimation
            notes=str(memory_step.error)
        )
        return

    # Progress update from step number (illustrative)
    progress = min(95, memory_step.step_number * 10)
    tools["task_status_update"](
        task_id=TASK_ID,
        status="in_progress",
        progress_pct=progress,
        notes=str(memory_step.observations)[:500] if memory_step.observations else ""
    )


def run_worker(task_id: str, task_description: str, agent_name: str):
    with MCPClient(
        {"url": "http://localhost:8000/mcp", "transport": "streamable-http"},
        structured_output=True
    ) as tools:
        # Claim task first (avoid multi-worker races)
        claim = tools["task_claim"](task_id=task_id, agent_name=agent_name)
        if claim != "ok":
            return  # Task already claimed

        tools["agent_run_log"](agent_name=agent_name, task_id=task_id, status="started")

        agent = CodeAgent(
            tools=tools,
            model=model,
            max_steps=20,
            step_callbacks=[worker_step_callback]
        )

        try:
            result = agent.run(task_description)
            tools["task_status_update"](task_id=task_id, status="done", progress_pct=100, notes=str(result)[:500])
            tools["agent_run_log"](agent_name=agent_name, task_id=task_id, status="completed")
        except Exception as e:
            tools["task_status_update"](task_id=task_id, status="failed", progress_pct=0, notes=str(e))
            tools["agent_run_log"](agent_name=agent_name, task_id=task_id, status="failed", error=str(e))
```


***

### Pattern 2 — Supervisor: projections-first control loop

Supervisors poll `pg_pragma` projections each cycle — **zero local bookkeeping**, MindBrain owns truth.

```python
import time
from smolagents import CodeAgent, ManagedAgent, MCPClient, InferenceClientModel

PROJECT_ID = "proj-001"
POLL_INTERVAL_SEC = 30

def orchestrator_loop(project_id: str):
    """
    Main supervision loop.
    Orchestrator reads MindBrain projections and acts.
    """
    model = InferenceClientModel("Qwen/Qwen2.5-Coder-32B-Instruct")

    with MCPClient(
        {"url": "http://localhost:8000/mcp", "transport": "streamable-http"},
        structured_output=True
    ) as tools:

        # Specialized workers exposed as ManagedAgents
        worker_ingestion = CodeAgent(tools=tools, model=model, name="worker_ingestion",
                                     description="Ingest and classify raw data into the knowledge graph.")
        worker_analysis  = CodeAgent(tools=tools, model=model, name="worker_analysis",
                                     description="Analyze KG entities and produce structured insights.")
        worker_review    = CodeAgent(tools=tools, model=model, name="worker_review",
                                     description="Validate KG entity quality and internal consistency.")

        orchestrator = CodeAgent(
            tools=tools,
            model=model,
            managed_agents=[
                ManagedAgent(worker_ingestion, name="worker_ingestion", description="..."),
                ManagedAgent(worker_analysis,  name="worker_analysis",  description="..."),
                ManagedAgent(worker_review,    name="worker_review",    description="..."),
            ]
        )

        # Supervision loop
        while True:
            health = tools["project_health"](project_id=project_id)
            next_action = health.get("next_action")

            # --- Decision 1: restart stalled agents ---
            stalled = tools["stalled_agents"](threshold_minutes=5)
            for stalled_agent in stalled:
                pending = tools["pending_tasks"](phase_id=health["current_phase_id"], limit=1)
                if pending:
                    task = pending[0]
                    _ = task  # extend orchestrator excerpt: dispatch stalled_agent, etc.


```

<span style="display:none">[^3_1][^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_2][^3_3][^3_4][^3_5][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://huggingface.co/learn/agents-course/unit2/smolagents/multi_agent_systems
[^3_2]: https://www.marktechpost.com/2026/04/15/a-coding-implementation-to-build-multi-agent-ai-systems-with-smolagents-using-code-execution-tool-calling-and-dynamic-orchestration/
[^3_3]: https://www.cohorte.co/blog/unpacking-smolagents-a-beginner-friendly-guide-to-agentic-systems
[^3_4]: https://starlog.is/articles/ai-agents/huggingface-smolagents
[^3_5]: https://huggingface.co/docs/smolagents/examples/multiagents
[^3_6]: https://docs.inkog.io/frameworks/smolagents
[^3_7]: https://techcommunity.microsoft.com/blog/adforpostgresql/what%E2%80%99s-new-in-the-postgres-16-query-planner--optimizer/4051828
[^3_8]: https://github.com/huggingface/smolagents
[^3_9]: https://deepwiki.com/huggingface/smolagents/6.2-multi-agent-orchestration
[^3_10]: https://pganalyze.com/blog/5mins-postgres-memoize-speed-up-joins
[^3_11]: https://saipien.org/smolagents-use-codeagent-toolcallingagent-to-build-lightweight-multi-agent-ai-automation/
[^3_12]: https://deepwiki.com/huggingface/smolagents/9-examples-and-use-cases
[^3_13]: https://www.depesz.com/2025/08/04/waiting-for-postgresql-19-display-memoize-planner-estimates-in-explain/
[^3_14]: https://github.com/ashwath007/smolagents-approach
[^3_15]: https://stackoverflow.com/questions/33651401/postgres-trigger-procedure-seems-to-be-memoized

