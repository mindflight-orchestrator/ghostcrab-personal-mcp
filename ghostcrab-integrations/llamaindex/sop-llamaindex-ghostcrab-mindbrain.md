<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

The most effective pitch for every framework is not to sell MindBrain as an "alternative database" but as a **shared context layer across agents**: today each framework keeps memory in silos; MindBrain/GhostCrab provides a structured, queryable, persistent ontology registry. That argument lands regardless of target framework.

task: target LlamaIndex — explain how integration should be implemented so it resonates under the LlamaIndex tag.

Full technical positioning for LlamaIndex using the shared-context argument.

***

## Structural problem inside LlamaIndex

LlamaIndex currently splits memory across **three isolated layers**: short-term `ChatMemoryBuffer` (FIFO under token caps), long-term `MemoryBlock` types (`FactExtractionMemoryBlock`, `VectorMemoryBlock`, `StaticMemoryBlock`), and document `StorageContext` [^1_1][^1_2]. These layers never align across agents — each `FunctionAgent`/`AgentWorkflow` instantiates its own `Memory`, defaulting to SQLite in-memory [^1_3][^1_1]. Silos are structural, accidental.

LlamaIndex pitch: **GhostCrab MCP replaces custom `BaseMemory` while acting as one shared registry for every workflow agent** — no native `MemoryBlock` achieves that scope.

***

## Technical integration hooks

LlamaIndex gives the seams you need:

**1. Custom `BaseMemory` (primary entry)**

LlamaIndex allows swapping the memory layer entirely through `BaseMemory` [^1_2]. MindBrain/GhostCrab lands here:

```python
from llama_index.core.memory import BaseMemory
from ghostcrab_mcp import MindBrainClient

class MindBrainMemory(BaseMemory):
    def __init__(self, agent_id: str, ontology_ns: str):
        self.client = MindBrainClient(agent_id=agent_id, ns=ontology_ns)

    async def put(self, message: ChatMessage) -> None:
        # Structured persistence into MindBrain ontology
        await self.client.assert_fact(
            subject=self.agent_id,
            predicate="observed",
            object=message.content,
            context={"role": message.role, "ts": message.timestamp}
        )

    async def get(self, input: str = "") -> list[ChatMessage]:
        # Faceted retrieval—not vector-only
        facts = await self.client.query_context(
            agent=self.agent_id,
            semantic_filter=input,
            facets=["role", "topic", "recency"]
        )
        return [ChatMessage(role=f.role, content=f.content) for f in facts]
```

**2. `StorageContext` + graph store (document ingestion path)**

LlamaIndex exposes `graph_store` in `StorageContext` [^1_4]. Plug MindBrain in as a custom `GraphStore` so `VectorStoreIndex` workloads resolve ontology relations instead of unstructured KG edges.

```python
storage_context = StorageContext.from_defaults(
    vector_store=MindBrainVectorStore(ns="project.docs"),
    graph_store=MindBrainGraphStore(ontology="mindbrain://project")
)
```

**3. Custom `MemoryBlock` (incremental adoption)**

Teams that hesitate to swap `Memory` wholesale can bolt GhostCrab on as another `MemoryBlock` with `priority=0` (never truncated) [^1_2] :

```python
class MindBrainOntologyBlock(BaseMemoryBlock):
    priority = 0  # jamais evicted

    async def _aget(self, messages, **kwargs) -> str:
        # Inject structured ontology context into system prompt
        return await ghostcrab.render_context_for(messages)

    async def _aput(self, messages, **kwargs) -> None:
        await ghostcrab.index_agent_turn(messages)
```


***

    async def _aget(self, messages, **kwargs) -> str:
        # Inject structured ontology context into the system prompt
        return await ghostcrab.render_context_for(messages)

    async def _aput(self, messages, **kwargs) -> None:
        await ghostcrab.index_agent_turn(messages)
```


***

## What changes in practice

| Native LlamaIndex memory | With MindBrain / GhostCrab |
| :-- | :-- |
| SQLite in-memory per agent [^1_3] | Shared persisted PostgreSQL |
| LLM-extracted facts (token cost) | Structurally asserted ontology facts |
| Vector-only retrieval | Faceted retrieval: subject + predicate + context + semantics |
| Context lost across separate workflows | Pipeline-wide registry all agents query |
| No knowledge typing | Explicit ontology ties (`observed`, `owns`, `depends_on`) |


***

## Message that resonates for the LlamaIndex tag

Documented friction: LlamaIndex `AgentWorkflow` shares workflow `Context` (runtime state) yet **no shared semantic memory** [^1_1]; research agents and summarizers operate on disjoint `Memory` islands. MindBrain solves that precise gap [^1_5].

Suggested GitHub / Discord wording:

> *"LlamaIndex's `AgentWorkflow` shares runtime `Context` but not semantic memory across agents. MindBrain/GhostCrab MCP provides a drop-in `BaseMemory` implementation backed by a structured ontological registry — queryable by any agent in the pipeline, persistent across sessions, with faceted retrieval instead of vector-only search."*

Precise, doc-backed, tackles real multi-agent friction [^1_5][^1_2].
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://developers.llamaindex.ai/python/examples/memory/memory/

[^1_2]: https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/

[^1_3]: https://www.youtube.com/watch?v=HxrccVf_RH8

[^1_4]: https://llamaindexxx.readthedocs.io/en/latest/api_reference/storage.html

[^1_5]: https://www.youtube.com/watch?v=XwUD9uXL0eg

[^1_6]: https://www.llamaindex.ai/blog/improved-long-and-short-term-memory-for-llamaindex-agents

[^1_7]: https://x.com/llama_index/status/1981752598698008725

[^1_8]: https://x.com/llama_index/status/1799114410985988399

[^1_9]: https://developers.llamaindex.ai/python/framework/module_guides/storing/customization/

[^1_10]: https://botwire.dev/articles/llamaindex-agent-memory

[^1_11]: https://github.com/run-llama/llama_index/blob/main/docs/docs/module_guides/storing/customization.md

[^1_12]: https://hindsight.vectorize.io/blog/2026/03/30/llamaindex-agent-memory

[^1_13]: https://www.linkedin.com/posts/sreeramanmg_most-ai-agent-failures-arent-about-model-activity-7358885337412026369-Sduy

[^1_14]: https://luma.com/t27lryii

[^1_15]: https://developers.llamaindex.ai/python/framework/module_guides/storing/save_load/


---

# Write `Skill.md` for LlamaIndex (Claude Code + Codex). American English.

The `SKILL_llamaindex.md` file is ready for Claude Code and Codex.

**File outline**

- **Section 1 — Rationale**: why LlamaIndex memory silos exist and MindBrain/GhostCrab resolves them — required context before code generation.
- **Section 2 — Three integrations** with runnable snippets:
    - **Option A** — `BaseMemory` drop-in (preferred); shared namespace ⇒ shared store.
    - **Option B** — additive `MemoryBlock` for incremental adoption without replacing native memory.
    - **Option C** — `StorageContext` graph store path for ingestion pipelines.
- **Section 3** — `MindBrainClient` method reference + namespace naming rules.
- **Sections 4–6** — option selection rubric, native vs MindBrain comparison, fallback pattern.
- **Section 7** — minimal working two-agent example.
- **Section 8 — Notes for code generation** — sync/async quirks, `priority=0`, namespace conventions, multi-tenant pitfalls.

Codex can mount the file straight into prompt context; Claude Code users can stash it under `.claude/skills/` or cite it in repo instructions.

---

# SKILL: GhostCrab Runtime — Agentic Orchestration with MindBrain

> **Package**: `ghostcrab-runtime`
> **Purpose**: Equip Claude Code and Codex with full context to implement agentic LlamaIndex workflows where MindBrain/GhostCrab acts as the shared operational brain: tracking state, projecting progress, signaling phase transitions, and driving orchestrator decisions.
>
> This skill covers two primary use cases, both sharing the same runtime primitives:
> - **Project Management** — agents track task status, deliverable progress, and phase gates
> - **Knowledge Graph Construction** — agents incrementally build, validate, and enrich an ontological graph

***

## 1. Mental Model: MindBrain as the Orchestration Brain

In a standard LlamaIndex `AgentWorkflow`, the orchestrator has no shared, queryable state about what agents have done, what remains, or whether a phase gate has been reached. Each agent reports back via message passing, and the orchestrator must re-derive state from conversation history.

GhostCrab Runtime inverts this. The orchestrator does not track state — it **reads state from MindBrain**. Every agent writes its progress as structured facts. The orchestrator queries `pg_pragma` projections to decide what to do next: spawn, halt, retry, or advance.

```
┌───────────────────────────────────────────────────────────────┐
│                        AgentWorkflow                          │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  ResearchAgent│    │ BuilderAgent │    │ ReviewerAgent  │  │
│  │  (worker)    │    │  (worker)    │    │  (worker)      │  │
│  └──────┬───────┘    └──────┬───────┘    └───────┬────────┘  │
│         │ assert_fact        │ assert_fact         │ assert_fact│
│         └───────────────────┴─────────────────────┘           │
│                              │                                 │
│                    ┌─────────▼──────────┐                     │
│                    │   MindBrain Store   │                     │
│                    │  (pg_pragma proj.)  │                     │
│                    └─────────┬──────────┘                     │
│                              │ query_projection                │
│                    ┌─────────▼──────────┐                     │
│                    │   OrchestratorAgent │                     │
│                    │  (reads, decides)   │                     │
│                    └────────────────────┘                     │
└───────────────────────────────────────────────────────────────┘
```


***

## 2. Core Primitives

### 2.1 Fact Schema

All agents write structured facts using the same schema. This is the contract between workers and the orchestrator.

```python
# Canonical fact shape written by every worker agent
await client.assert_fact(
    subject="task:{task_id}",          # What entity this is about
    predicate="has_status",            # What relationship/property
    object="in_progress",              # The value
    context={
        "agent": "builder-agent-01",   # Who wrote this
        "phase": "implementation",     # Current project phase
        "ts": "2026-05-10T14:00:00Z",  # ISO timestamp
        "confidence": 0.9,             # Optional: agent confidence score
        "payload": {...},              # Optional: structured data blob
    }
)
```

**Standard predicates** (use these consistently across all agents in a workflow):


| Predicate | Subject | Object values | Description |
| :-- | :-- | :-- | :-- |
| `has_status` | `task:{id}` | `pending`, `in_progress`, `blocked`, `done`, `failed` | Task lifecycle state |
| `has_phase` | `project:{id}` | Phase name string | Current active phase |
| `depends_on` | `task:{id}` | `task:{other_id}` | Dependency edge |
| `assigned_to` | `task:{id}` | `agent:{id}` | Agent assignment |
| `has_score` | `task:{id}` | Float string `"0.85"` | Completion or quality score |
| `has_error` | `task:{id}` | Error message string | Failure reason |
| `is_node` | `node:{id}` | Node type string | KG node declaration |
| `is_edge` | `edge:{id}` | Relation type string | KG edge declaration |
| `validated_by` | `node:{id}` | `agent:{id}` | KG validation authorship |
| `contradicts` | `node:{id}` | `node:{other_id}` | KG conflict signal |


***

### 2.2 `pg_pragma` Projections

`pg_pragma` is MindBrain's projection engine. It computes derived views over the fact store — percentages, phase readiness checks, agent liveness scores — without the orchestrator needing to re-query raw facts.

The orchestrator queries projections, not raw facts. Projections are declared once and reused across all runs.

**Available projections** (registered via `client.register_projection`):

```python
# Register at workflow startup — idempotent, safe to call on every run
await client.register_projection(
    name="phase_completion",
    ns="project.alpha",
    spec={
        "type": "ratio",
        "numerator": {"predicate": "has_status", "object": "done"},
        "denominator": {"predicate": "has_status"},  # all status facts
        "group_by": "context.phase",
    }
)

await client.register_projection(
    name="blocked_tasks",
    ns="project.alpha",
    spec={
        "type": "filter",
        "predicate": "has_status",
        "object": "blocked",
        "include_context": True,
    }
)

await client.register_projection(
    name="agent_liveness",
    ns="project.alpha",
    spec={
        "type": "recency",
        "group_by": "context.agent",
        "staleness_threshold_seconds": 120,  # agent is stale if no write in 2min
    }
)

await client.register_projection(
    name="kg_coverage",
    ns="project.alpha.kg",
    spec={
        "type": "ratio",
        "numerator": {"predicate": "validated_by"},
        "denominator": {"predicate": "is_node"},
        "label": "validated_node_ratio",
    }
)
```

**Querying a projection:**

```python
result = await client.query_projection("phase_completion", ns="project.alpha")
# Returns:
# {
#   "implementation": 0.67,
#   "review": 0.10,
#   "planning": 1.0
# }
```


***

## 3. Worker Agent Pattern

Every worker agent follows the same three-step contract: **claim → work → report**.

```python
from llama_index.core.agent.workflow import FunctionAgent
from ghostcrab_runtime import MindBrainMemory, RuntimeClient


class WorkerAgent:
    """Base pattern for all worker agents in a GhostCrab-orchestrated workflow."""

    def __init__(self, agent_id: str, ns: str, mcp_url: str):
        self.agent_id = agent_id
        self.client = RuntimeClient(base_url=mcp_url, agent_id=agent_id, ns=ns)
        self.memory = MindBrainMemory(agent_id=agent_id, ontology_ns=ns, mcp_url=mcp_url)

    async def claim_task(self, task_id: str, phase: str) -> None:
        """Mark a task as claimed by this agent."""
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="has_status",
            object="in_progress",
            context={"agent": self.agent_id, "phase": phase},
        )
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="assigned_to",
            object=f"agent:{self.agent_id}",
            context={"phase": phase},
        )

    async def complete_task(self, task_id: str, phase: str, score: float = 1.0) -> None:
        """Mark a task as done with an optional quality score."""
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="has_status",
            object="done",
            context={"agent": self.agent_id, "phase": phase, "score": str(score)},
        )
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="has_score",
            object=str(score),
            context={"agent": self.agent_id},
        )

    async def fail_task(self, task_id: str, phase: str, reason: str) -> None:
        """Report a task failure with reason."""
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="has_status",
            object="failed",
            context={"agent": self.agent_id, "phase": phase},
        )
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="has_error",
            object=reason,
            context={"agent": self.agent_id, "phase": phase},
        )

    async def block_task(self, task_id: str, blocked_by: str, phase: str) -> None:
        """Signal that a task is blocked on a dependency."""
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="has_status",
            object="blocked",
            context={"agent": self.agent_id, "phase": phase, "blocked_by": blocked_by},
        )
        await self.client.assert_fact(
            subject=f"task:{task_id}",
            predicate="depends_on",
            object=f"task:{blocked_by}",
            context={},
        )
```


***

## 4. Orchestrator Agent Pattern

The orchestrator never does work. It **reads projections, evaluates gate conditions, and dispatches decisions**. All decisions are driven by `pg_pragma` projections.

```python
from ghostcrab_runtime import RuntimeClient, PhaseGate
from llama_index.core.agent.workflow import AgentWorkflow


class GhostCrabOrchestrator:
    """
    Orchestrator that drives an AgentWorkflow based on MindBrain projections.
    Uses pg_pragma to evaluate phase gates and agent health.
    """

    PHASE_ORDER = ["planning", "implementation", "review", "delivery"]

    def __init__(self, ns: str, mcp_url: str):
        self.client = RuntimeClient(
            base_url=mcp_url, agent_id="orchestrator", ns=ns
        )
        self.ns = ns

    # ── Phase gate evaluation ─────────────────────────────────────────────────

    async def current_phase(self, project_id: str) -> str:
        facts = await self.client.query_facts(
            subject=f"project:{project_id}",
            predicate="has_phase",
            limit=1,
            order_by="ts_desc",
        )
        return facts[0]["object"]
```

