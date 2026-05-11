<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

The most effective pitch for every framework is not to sell MindBrain as an "alternative database" but as a **shared context layer across agents**: today each framework keeps memory in silos; MindBrain/GhostCrab provides a structured, queryable, persistent ontology registry. That argument lands regardless of target framework.

task: target Microsoft AutoGen — explain how integration should be implemented with this framework.

Here is the necessary material. AutoGen’s documentation is clear on its weak spots: per-agent siloed memory (`ListMemory`, ChromaDB, Redis), with no cross-agent shared registry or structured semantic model. GhostCrab/MindBrain integration targets exactly that gap.

***

## Integrating MindBrain/GhostCrab with Microsoft AutoGen

The angle is specific: AutoGen 0.4 handles memory per agent through its `Memory` protocol (`ListMemory`, ChromaDB, Redis), each instance staying isolated [^1_1]. MindBrain/GhostCrab plugs in as a **single** implementation of that protocol — **shared** across every agent on a team.

***

## What AutoGen provides out of the box

AutoGen exposes a `Memory` protocol with four methods: `add`, `query`, `update_context`, `clear` [^1_2]. Built-in implementations are `ListMemory` (chronological, in-memory), `ChromaDBVectorMemory` (local vector similarity), and `RedisMemory` (Redis vectors) [^1_1]. Each `AssistantAgent` gets **its own** memory instance — there is no shared registry across agents on the same team by default [^1_3].

***

## Entry point: implement the `Memory` protocol

Integration means subclassing AutoGen’s abstract `Memory` class and delegating to GhostCrab (the MCP server) :

```python
from autogen_core.memory import Memory, MemoryContent, MemoryQueryResult
from autogen_agentchat.agents import AssistantAgent

class MindBrainMemory(Memory):
    """Shared context layer backed by GhostCrab MCP."""

    def __init__(self, mcp_client, namespace: str = "default"):
        self._client = mcp_client  # GhostCrab MCP client (SSE or stdio)
        self._namespace = namespace

    async def add(self, content: MemoryContent) -> None:
        # Map MemoryContent → MindBrain ontology operation
        await self._client.call_tool("mindbrain_add", {
            "namespace": self._namespace,
            "content": content.content,
            "mime_type": str(content.mime_type),
            "metadata": content.metadata or {}
        })

    async def query(self, query: str, **kwargs) -> MemoryQueryResult:
        # Faceted or graph query against MindBrain
        result = await self._client.call_tool("mindbrain_query", {
            "namespace": self._namespace,
            "query": query,
            "k": kwargs.get("k", 5)
        })
        return MemoryQueryResult(results=[
            MemoryContent(content=r["content"], mime_type=..., metadata=r["metadata"])
            for r in result["entries"]
        ])

    async def update_context(self, model_context) -> None:
        # Inject retrieved MindBrain context into the agent model_context
        ...

    async def clear(self) -> None:
        await self._client.call_tool("mindbrain_clear", {"namespace": self._namespace})

    async def close(self) -> None:
        await self._client.close()
```


***

## Cross-cutting share across agents on a team

That is the core argument. Passing the **same** `MindBrainMemory` instance into several agents means they all read and write one ontology-backed registry — something AutoGen’s stock backends cannot do :

```python
# Single shared instance
shared_context = MindBrainMemory(mcp_client=ghostcrab_client, namespace="project_x")

planner = AssistantAgent("planner", model_client=..., memory=[shared_context])
coder   = AssistantAgent("coder",   model_client=..., memory=[shared_context])
critic  = AssistantAgent("critic",  model_client=..., memory=[shared_context])

team = RoundRobinGroupChat([planner, coder, critic])
```

When `planner` records an architecture decision, `coder` picks it up without an explicit re-prompt — context stays structured, persistent, and queryable [^1_2].

***

## Connecting to GhostCrab via `autogen-ext` MCP

Since AutoGen v0.4.6, native MCP support lives in `autogen-ext` [^1_4]. GhostCrab exposes an MCP server (SSE or stdio), so you use the official bridge for **tools** and a custom `Memory` implementation for **context** :

```python
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams

# GhostCrab connection (MCP over SSE)
ghostcrab_params = SseServerParams(url="http://localhost:8080/mcp")

# Use as MCP tool workbench (ontology + graph queries)
async with McpWorkbench(ghostcrab_params) as workbench:
    agent = AssistantAgent(
        "orchestrator",
        model_client=...,
        workbench=workbench,       # MCP tools (faceted query, graph traversal)
        memory=[shared_context],   # shared MindBrain context
    )
```


***

## What MindBrain adds that ChromaDB/Redis do not

| Capability | ChromaDB/Redis (AutoGen default) | MindBrain via GhostCrab |
| :-- | :-- | :-- |
| Cross-agent persistence | ❌ silos per instance | ✅ single registry |
| Semantic querying | Vector similarity only | Faceted + graph + vector |
| Ontology model | None | Types, relationships, constraints |
| Structured queryability | No | SQL-like graph queries |
| Cross-session without re-index | ❌ | ✅ PostgreSQL persistence |

[^1_5][^1_1]

***

## Namespace per team, shared by default

Integration best practice: use a MindBrain `namespace` aligned with the AutoGen team id. That isolates contexts across projects while still allowing cross-namespace reads when an orchestrator must aggregate global knowledge — `update_context` can implement that with a multi-namespace query on GhostCrab.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://mintlify.wiki/microsoft/autogen/agentchat/memory

[^1_2]: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html

[^1_3]: https://createaiagent.net/autogen-vs-microsoft-agent-framework/

[^1_4]: https://github.com/richard-gyiko/autogen-ext-mcp

[^1_5]: https://sns.style/en/tech/2026/03/04/microsoft-agent-framework-autogen-v0-4-new-enterprise-multi-agent-orchestration-3

[^1_6]: https://www.microsoft.com/en-us/research/wp-content/uploads/2025/01/WEF-2025_Leave-Behind_AutoGen.pdf

[^1_7]: https://sparkco.ai/blog/deep-dive-into-autogen-multi-agent-patterns-2025

[^1_8]: https://dev.to/bspann/microsoft-agent-framework-the-future-of-net-ai-agents-has-arrived-22mf

[^1_9]: https://github.com/SaM-92/mcp_autogen_sse_stdio

[^1_10]: https://github.com/microsoft/autogen/issues/6466

[^1_11]: https://www.microsoft.com/en-us/research/articles/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/

[^1_12]: https://www.youtube.com/watch?v=zeGloAHG1f4

[^1_13]: https://fast.io/resources/autogen-memory/

[^1_14]: https://galileo.ai/blog/autogen-framework-multi-agents

[^1_15]: https://mcpservers.org/servers/DynamicEndpoints/Autogen_MCP


---

# SKILLS — MindBrain/GhostCrab integration for Microsoft AutoGen

> This file is a reference guide for Claude Code and Codex.
> It describes architecture, implementation patterns, and rules
> for integrating MindBrain (ontology registry) and GhostCrab (MCP server)
> into a Microsoft AutoGen (v0.4+) project.

***

## Context and positioning

AutoGen handles memory per agent via its `Memory` protocol
(`ListMemory`, `ChromaDBVectorMemory`, `RedisMemory`). Each instance is isolated:
there is no shared registry across agents on the same team by default.

**MindBrain** replaces those backends with a shared context layer:
a structured, persistent (PostgreSQL), queryable (facets + graph) ontology registry.
**GhostCrab** is the MCP server that exposes that registry to agents over MCP.

Integration rests on three pillars:

1. Implement AutoGen’s `Memory` protocol by delegating to GhostCrab
2. Share one instance across every agent on a team
3. Expose GhostCrab tools (query, graph, facets) through AutoGen’s native MCP workbench

***

## Stack and prerequisites

| Component | Minimum version | Notes |
| :-- | :-- | :-- |
| `autogen-agentchat` | 0.4.6+ | Stable `Memory` protocol |
| `autogen-ext` | 0.4.6+ | `McpWorkbench`, `SseServerParams` |
| `autogen-core` | 0.4.6+ | `MemoryContent`, `MemoryQueryResult` |
| GhostCrab MCP Server | — | SSE at `http://localhost:8080/mcp` |
| MindBrain | — | PostgreSQL backend, pg_facets, pg_dgraph |
| Python | 3.11+ |  |

Python dependencies:

```
autogen-agentchat>=0.4.6
autogen-ext[mcp]>=0.4.6
autogen-core>=0.4.6
mcp>=1.0.0
```


***

## Integration architecture

```
┌─────────────────────────────────────────────────────┐
│                  AutoGen Team                        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │           │
│  │ planner  │  │  coder   │  │  critic  │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │             │             │                  │
│       └─────────────┼─────────────┘                  │
│                     │  shared instance               │
│           ┌─────────▼──────────┐                    │
│           │  MindBrainMemory   │  implements Memory  │
│           └─────────┬──────────┘                    │
└─────────────────────┼───────────────────────────────┘
                      │ MCP (SSE / stdio)
           ┌──────────▼──────────┐
           │   GhostCrab MCP     │
           │   Server            │
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────┐
           │   MindBrain         │
           │   PostgreSQL        │
           │   pg_facets         │
           │   pg_dgraph         │
           └─────────────────────┘
```


***

## Implementation: `MindBrainMemory`

### Naming conventions

- Class: `MindBrainMemory`
- File: `mindbrain/autogen/memory.py`
- Namespace: matches team or project id


### Reference code

```python
# mindbrain/autogen/memory.py
from __future__ import annotations

from typing import Any

from autogen_core.memory import (
    Memory,
    MemoryContent,
    MemoryMimeType,
    MemoryQueryResult,
    UpdateContextResult,
)
from autogen_core.model_context import ChatCompletionContext


class MindBrainMemory(Memory):
    """
    AutoGen `Memory` protocol implementation delegating
    to GhostCrab MCP to store and query the MindBrain
    ontology registry.

    Usage :
        shared = MindBrainMemory(mcp_client, namespace="team_alpha")
        agent  = AssistantAgent("planner", memory=[shared], ...)
    """

    def __init__(self, mcp_client: Any, namespace: str = "default") -> None:
        self._client = mcp_client
        self._namespace = namespace

    @property
    def name(self) -> str:
        return f"MindBrainMemory:{self._namespace}"

    async def add(self, content: MemoryContent, cancellation_token=None) -> None:
        """Persist content in MindBrain through GhostCrab."""
        await self._client.call_tool(
            "mindbrain_add",
            {
                "namespace": self._namespace,
                "content": content.content,
                "mime_type": str(content.mime_type),
                "metadata": content.metadata or {},
            },
        )

    async def query(
        self,
        query: str,
        cancellation_token=None,
        **kwargs: Any,
    ) -> MemoryQueryResult:
        """
        Faceted or semantic query against MindBrain.
        Optional arguments :
          - k (int)       : result count (default 5)
          - mode (str)    : "semantic" | "faceted" | "graph" (default "semantic")
          - filters (dict): ontology filters
        """
        result = await self._client.call_tool(
            "mindbrain_query",
            {
                "namespace": self._namespace,
                "query": query,
                "k": kwargs.get("k", 5),
                "mode": kwargs.get("mode", "semantic"),
                "filters": kwargs.get("filters", {}),
            },
        )
        entries = result.get("entries", [])
        return MemoryQueryResult(
            results=[
                MemoryContent(
                    content=e["content"],
                    mime_type=MemoryMimeType.TEXT,
                    metadata=e.get("metadata", {}),
                )
                for e in entries
            ]
        )

    async def update_context(
        self,
        model_context: ChatCompletionContext,
        cancellation_token=None,
    ) -> UpdateContextResult:
        """
        Inject MindBrain context into the agent model_context.
        Invoked automatically by AutoGen before each inference.
        """
        # Read the latest user message from context
        messages = await model_context.get_messages()
        if not messages:
            return UpdateContextResult(memories=MemoryQueryResult(results=[]))

        last_user_msg = next(
            (m.content for m in reversed(messages) if m.role == "user"),
            "",
        )

        result = await self.query(last_user_msg, k=5)

        if result.results:
            context_str = "\n\n".join(
                f"[MindBrain context]\n{r.content}" for r in result.results
            )
            from autogen_core.models import SystemMessage
            await model_context.add_message(
                SystemMessage(content=context_str)
            )

        return UpdateContextResult(memories=result)

    async def clear(self, cancellation_token=None) -> None:
        """Clears the namespace in MindBrain."""
        await self._client.call_tool(
            "mindbrain_clear",
            {"namespace": self._namespace},
        )

    async def close(self) -> None:
        """Cleanly shuts down the MCP connection."""
        if hasattr(self._client, "close"):
            await self._client.close()
```


***

## Implementation: GhostCrab connection (MCP)

### SSE (recommended for remote server)

```python
# mindbrain/autogen/client.py
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams


def ghostcrab_sse_params(host: str = "localhost", port: int = 8080) -> SseServerParams:
    return SseServerParams(url=f"http://{host}:{port}/mcp")
```


### stdio (recommended for local development)

```python
from autogen_ext.tools.mcp import McpWorkbench, StdioServerParams


def ghostcrab_stdio_params(binary_path: str = "./ghostcrab") -> StdioServerParams:
    return StdioServerParams(
        command=binary_path,
        args=["serve", "--stdio"],
    )
```


***

## Implementation: assembling an AutoGen team

```python
# examples/autogen_team.py
import asyncio
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import MaxMessageTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench

from mindbrain.autogen.client import ghostcrab_sse_params
from mindbrain.autogen.memory import MindBrainMemory


async def main() -> None:
    ghostcrab_params = ghostcrab_sse_params()

    async with McpWorkbench(ghostcrab_params) as workbench:
        # Shared context: one MindBrainMemory for the entire team
        shared_context = MindBrainMemory(
            mcp_client=workbench,
            namespace="team_alpha",
        )

        model = OpenAIChatCompletionClient(model="gpt-4o")

        planner = AssistantAgent(
            name="planner",
            model_client=model,
            memory=[shared_context],
            workbench=workbench,          # tools MCP (graph, facets)
            system_message=(
                "You are the planner. Before each decision, "
                "consult MindBrain context for consistency."
            ),
        )
        coder = AssistantAgent(
            name="coder",
            model_client=model,
            memory=[shared_context],
            workbench=workbench,
            system_message=(
                "You implement. Record every technical decision "
                "in MindBrain via mindbrain_add."
            ),
        )
        critic = AssistantAgent(
            name="critic",
            model_client=model,
            memory=[shared_context],
            system_message=(
                "You validate. Query MindBrain to check consistency "
                "with past decisions before you approve."
            ),
        )

        team = RoundRobinGroupChat(
            [planner, coder, critic],
            termination_condition=MaxMessageTermination(12),
        )

        await team.run(task="Design a faceted indexing module.")


if __name__ == "__main__":
    asyncio.run(main())
```


***

## GhostCrab tools exposed through MCP

These tools are available in the AutoGen workbench automatically
once GhostCrab is connected. Agents can call them directly.


| MCP tool | Description | Key parameters |
| :-- | :-- | :-- |
| `mindbrain_add` | Add content to the registry | `namespace`, `content`, `metadata` |
| `mindbrain_query` | Semantic / faceted query | `namespace`, `query`, `k`, `mode`, `filters` |
| `mindbrain_graph_query` | Graph traversal | `namespace`, `start_node`, `relation`, `depth` |
| `mindbrain_facet_search` | Strict faceted search | `namespace`, `facets` (dict) |
| `mindbrain_clear` | Clear a namespace | `namespace` |
| `mindbrain_list_namespaces` | List active namespaces | — |


***

## Namespace strategy

```
namespace = "{project_id}:{team_id}"

Examples:
  "mindflight:team_alpha"   → design team
  "mindflight:team_beta"    → validation team
  "mindflight:global"       → cross-team registry (read-only recommended)
```

**Rules:**

- Each AutoGen team has its own namespace
- An orchestrator may read multiple namespaces via `mindbrain_query` with `namespace="*"`
- Never use `"default"` in production

***

## Error handling

### MCP timeout

```python
import asyncio

async def safe_add(memory: MindBrainMemory, content: MemoryContent) -> None:
    try:
        await asyncio.wait_for(memory.add(content), timeout=5.0)
    except asyncio.TimeoutError:
        # Log and continue — do not block the agent
        pass
```


### Fallback when GhostCrab is unavailable

```python
from autogen_core.memory import ListMemory

def build_memory(mcp_client=None, namespace="default") -> Memory:
    if mcp_client is not None:
        return MindBrainMemory(mcp_client, namespace)
    # Fallback: siloed memory, no persistence
    return ListMemory()
```


***

## Tests

### Recommended layout

```
tests/
├── unit/
│   └── test_mindbrain_memory.py   # mock MCP client
└── integration/
    └── test_autogen_team.py       # real GhostCrab required
```


### Unit test example

```python
# tests/unit/test_mindbrain_memory.py
import pytest
from unittest.mock import AsyncMock
from mindbrain.autogen.memory import MindBrainMemory
from autogen_core.memory import MemoryContent, MemoryMimeType


@pytest.fixture
def mock_client():
    client = AsyncMock()
    client.call_tool.return_value = {
        "entries": [
            {"content": "Decision: use pg_facets", "metadata": {"agent": "planner"}}
        ]
    }
    return client


@pytest.mark.asyncio
async def test_query_returns_results(mock_client):
    mem = MindBrainMemory(mock_client, namespace="test")
    result = await mem.query("indexation")
    assert len(result.results) == 1
    assert "pg_facets" in result.results[0]
```

---

# Draft Microsoft Autogen `Skill.md` ghostcrab-architect for Claude Code and Codex. American English. Goal: create an ontology using GhostCrab MCP onboarding for a Microsoft Autogen agent.

The `SKILL_ghostcrab-architect_autogen.md` file is ready.

Here's what it covers:

**Architecture** — the `AssistantAgent → McpWorkbench → GhostCrab → MindBrain` chain, with the exact onboarding sequence GhostCrab enforces (7 ordered steps from `namespace_init` to `snapshot_export`).[^3_1][^3_2]

**Tool reference table** — all GhostCrab MCP tools organized by category (namespace, schema declaration, data ops, query, export), with required/optional params and return shapes. The agent discovers them automatically via `workbench.list_tools()` at runtime.[^3_3]

**Three implementation layers:**
- `connection.py` — SSE and stdio helpers
- `architect.py` — single-agent pattern with a system prompt that enforces the onboarding order strictly and `reflect_on_tool_use=True` so the agent self-corrects after tool errors
- `team.py` — two-agent pattern (Architect builds, Reviewer validates via graph traversal before exporting)

**Concrete task example** — a software architecture ontology with 3 entity types, 4 relation types, 4 entities, and 3 edges, exported as JSON-LD. Ready to run as-is.

**Testing** — a `make_mock_workbench` factory for unit tests (no live server), plus a full integration test covering the 3-step onboarding sequence.[^3_4]
<span style="display:none">[^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_5][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://github.com/microsoft/autogen/issues/6534
[^3_2]: https://github.com/microsoft/autogen/pull/6340
[^3_3]: https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/components/workbench.html
[^3_4]: https://mintlify.wiki/microsoft/autogen/examples/web-browsing
[^3_5]: https://microsoft.github.io/autogen/stable/reference/python/autogen_ext.tools.mcp.html
[^3_6]: https://newsletter.victordibia.com/p/how-to-use-mcp-anthropic-mcp-tools
[^3_7]: https://mintlify.wiki/microsoft/autogen/extensions/tools
[^3_8]: https://www.linkedin.com/pulse/building-multi-agent-workflows-autogen-mcp-new-ganesh-jagadeesan-lcxuf
[^3_9]: https://github.com/ai4curation/owl-mcp
[^3_10]: https://www.reddit.com/r/AutoGenAI/comments/1im587f/tools_and_function_calling_via_custom_model/
[^3_11]: https://mcpmarket.com/server/ontology
[^3_12]: https://www.gettingstarted.ai/autogen-mcp/
[^3_13]: https://github.com/microsoft/autogen/discussions/4449
[^3_14]: https://palantir.com/docs/foundry/ontology-mcp/overview/
[^3_15]: https://mintlify.com/microsoft/autogen/extensions/tools

---

# SKILL: ghostcrab-runtime
**Target:** Claude Code · Codex  
**Goal:** General-purpose runtime for AutoGen multi-agent systems — project management, knowledge graph lifecycle, task progression tracking, and orchestrator-driven phase control using GhostCrab MCP and MindBrain pg_pragma projections.  
**Language:** Python 3.11+ · AutoGen 0.4.6+

***

## Overview

This skill covers **two complementary responsibilities**:

| Layer | Who uses it | What it does |
|---|---|---|
| **Worker layer** | Any AutoGen agent | Records task status, progression, and knowledge into MindBrain via GhostCrab tools |
| **Orchestrator layer** | `SelectorGroupChat` orchestrator | Reads pg_pragma projections to decide which agent to activate, when to change project phase, when to stop |

The key insight: **MindBrain is the single source of truth for runtime state**. Agents write their progress into it. The orchestrator reads aggregated projections from it to make control decisions — without relying on conversation history alone.

***

## Prerequisites

### Python packages

```

autogen-agentchat>=0.4.6
autogen-ext[mcp]>=0.4.6
autogen-core>=0.4.6
mcp>=1.0.0

```

### GhostCrab MCP server

Must be running before agents start.

| Mode | Command |
|---|---|
| SSE (prod) | `./ghostcrab serve --sse --port 8080` |
| stdio (dev) | `./ghostcrab serve --stdio` |

***

## Core Concepts

### Task Status Model

Every task/item in MindBrain carries a `status` attribute.
All agents must use these canonical values — no custom strings.

```

PENDING    → not yet started
IN_PROGRESS → an agent is actively working on it
BLOCKED    → waiting on a dependency
DONE       → completed and validated
FAILED     → failed, requires intervention
SKIPPED    → explicitly bypassed

```

### Project Phase Model

A project is an entity in MindBrain with a `phase` attribute.
The orchestrator is the only agent authorized to transition phases.

```

PLANNING  → requirements and architecture
BUILDING  → implementation in progress
REVIEW    → validation and testing
DELIVERY  → packaging and deployment
CLOSED    → project complete

```

### pg_pragma Projections

pg_pragma is MindBrain's projection layer: it materializes aggregated views
of the ontology graph into read-optimized PostgreSQL tables.
The orchestrator calls `ghostcrab_pragma_query` to read these projections
without scanning the full graph — low latency, high signal.

Built-in projections used in this skill:

| Projection | Returns | Orchestrator uses it to |
|---|---|---|
| `task_summary` | Counts per status per phase | Detect phase completion or stalls |
| `agent_load` | Active tasks per agent | Load-balance or detect idle agents |
| `blockers` | All BLOCKED tasks with their dependency | Decide intervention |
| `critical_path` | Longest dependency chain | Estimate remaining time |
| `phase_readiness` | Score 0–100 for transition readiness | Trigger phase change |

***

## Tool Reference

### Status & Progression Tools (Worker agents)

| Tool | Required params | Description |
|---|---|---|
| `ghostcrab_task_create` | `namespace`, `task_id`, `title`, `type`, `assignee`, `phase` | Creates a task entity |
| `ghostcrab_task_status_set` | `namespace`, `task_id`, `status`, `note?` | Sets task status |
| `ghostcrab_task_progress_set` | `namespace`, `task_id`, `progress: 0–100` | Sets numeric progress |
| `ghostcrab_task_block` | `namespace`, `task_id`, `blocked_by: task_id` | Marks task as BLOCKED with dependency |
| `ghostcrab_task_unblock` | `namespace`, `task_id` | Clears BLOCKED status |
| `ghostcrab_knowledge_add` | `namespace`, `content`, `source_task_id`, `tags?: []` | Records knowledge produced by a task |
| `ghostcrab_entity_update` | `namespace`, `entity_id`, `attributes` | Generic attribute update |

### Orchestrator Tools (Orchestrator agent only)

| Tool | Required params | Optional params | Description |
|---|---|---|---|
| `ghostcrab_pragma_query` | `namespace`, `projection` | `filters?` | Reads a pg_pragma projection |
| `ghostcrab_phase_transition` | `namespace`, `project_id`, `to_phase` | `reason?` | Transitions project phase |
| `ghostcrab_agent_signal` | `namespace`, `agent_name`, `signal` | `context?` | Sends RESUME / PAUSE / STOP to an agent |
| `ghostcrab_task_reassign` | `namespace`, `task_id`, `new_assignee` | — | Reassigns a task |
| `ghostcrab_query` | `namespace`, `query` | `mode`, `k` | Full ontology query |

Signal values for `ghostcrab_agent_signal`:
```

RESUME  → re-activate a paused or idle agent
PAUSE   → pause an agent after its current task
STOP    → stop an agent immediately
RESTART → stop and re-initialize an agent

```

***

## Implementation

### 1. GhostCrab connection

```python
# ghostcrab/autogen/connection.py
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams, StdioServerParams


def sse_params(host: str = "localhost", port: int = 8080) -> SseServerParams:
    return SseServerParams(url=f"http://{host}:{port}/mcp")


def stdio_params(binary: str = "./ghostcrab") -> StdioServerParams:
    return StdioServerParams(command=binary, args=["serve", "--stdio"])
```


### 2. Worker agent — system prompt template

```python
# ghostcrab/autogen/worker_prompt.py

WORKER_PROMPT_TEMPLATE = """
You are {agent_name}, a worker agent in project `{project_id}` (namespace: `{namespace}`).
Your current phase is: {phase}.
Your assigned task type: {task_type}.

## How to handle a task

1. When you START a task:
   - Call ghostcrab_task_status_set(task_id=..., status="IN_PROGRESS", note="Starting work.")

2. While working, update progress regularly:
   - Call ghostcrab_task_progress_set(task_id=..., progress=<0-100>)

3. If you produce knowledge (a decision, a finding, a document):
   - Call ghostcrab_knowledge_add(content=..., source_task_id=..., tags=[...])

4. If you are BLOCKED by a missing dependency:
   - Call ghostcrab_task_block(task_id=..., blocked_by=<blocking_task_id>)
   - Then say: BLOCKED: <reason>. Do NOT continue until unblocked.

5. When you COMPLETE a task:
   - Call ghostcrab_task_progress_set(task_id=..., progress=100)
   - Call ghostcrab_task_status_set(task_id=..., status="DONE", note="<summary>")
   - Then say: TASK_DONE: <task_id>

6. If you FAIL:
   - Call ghostcrab_task_status_set(task_id=..., status="FAILED", note="<reason>")
   - Then say: TASK_FAILED: <task_id> — <reason>

## Rules
- Always include the namespace `{namespace}` in every tool call.
- Never mark a task DONE without setting progress=100 first.
- Never transition phases — that is the orchestrator's role.
- Keep knowledge notes concise (< 200 words).
"""


def worker_prompt(
    agent_name: str,
    project_id: str,
    namespace: str,
    phase: str,
    task_type: str,
) -> str:
    return WORKER_PROMPT_TEMPLATE.format(
        agent_name=agent_name,
        project_id=project_id,
        namespace=namespace,
        phase=phase,
        task_type=task_type,
    )
```


### 3. Orchestrator agent — system prompt

```python
# ghostcrab/autogen/orchestrator_prompt.py

ORCHESTRATOR_PROMPT = """
You are GhostCrab Orchestrator for project `{project_id}` (namespace: `{namespace}`).
Current phase: {phase}.
Worker agents available: {agent_names}.

## Your decision loop

At each turn, run this analysis before deciding anything:

### Step 1 — Read projections
Call ghostcrab_pragma_query for each of these projections:
  - projection: "task_summary"     → overall task counts per status
  - projection: "agent_load"       → how many active tasks each agent has
  - projection: "blockers"         → any BLOCKED tasks
  - projection: "phase_readiness"  → readiness score for next phase transition

### Step 2 — Decide

Use the following decision matrix:

| Condition | Action |
|---|---|
| An agent has 0 active tasks AND PENDING tasks exist for its type | ghostcrab_agent_signal(signal="RESUME") to that agent |
| An agent is overloaded (>3 active tasks) AND another agent is idle | ghostcrab_task_reassign + ghostcrab_agent_signal |
| A task is BLOCKED | Investigate the blocker; if resolvable, ghostcrab_task_unblock |
| phase_readiness score >= 85 AND current phase is not CLOSED | ghostcrab_phase_transition to the next phase |
| All tasks DONE or SKIPPED | ghostcrab_phase_transition to CLOSED, then say: PROJECT_COMPLETE |
| An agent has had FAILED tasks for > 2 turns | ghostcrab_agent_signal(signal="RESTART") |
| No progress for > 3 turns (same task_summary) | Diagnose, then RESTART the stalled agent |

### Step 3 — Signal the right agent

After your analysis, say: ACTIVATE: <agent_name> — <brief instruction>
OR: WAIT — <reason> (if all agents are correctly active)
OR: PROJECT_COMPLETE (if project is CLOSED)

## Rules
- You are the ONLY agent who may call ghostcrab_phase_transition and ghostcrab_agent_signal.
- Call at least ghostcrab_pragma_query("task_summary") every turn.
- Never guess task status from conversation — always read from MindBrain.
- Keep your instructions to workers short and actionable.
- Do not do implementation work yourself.
"""


def orchestrator_prompt(
    project_id: str,
    namespace: str,
    phase: str,
    agent_names: list[str],
) -> str:
    return ORCHESTRATOR_PROMPT.format(
        project_id=project_id,
        namespace=namespace,
        phase=phase,
        agent_names=", ".join(agent_names),
    )
```


### 4. Team assembly

```python
# ghostcrab/autogen/runtime.py
import asyncio
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import SelectorGroupChat
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench

from ghostcrab.autogen.connection import sse_params
from ghostcrab.autogen.worker_prompt import worker_prompt
from ghostcrab.autogen.orchestrator_prompt import orchestrator_prompt


async def run_project(
    project_id: str,
    namespace: str,
    initial_task: str,
    initial_phase: str = "PLANNING",
) -> None:
    async with McpWorkbench(sse_params()) as workbench:
        model = OpenAIChatCompletionClient(model="gpt-4o")

        # --- Worker agents ---
        researcher = AssistantAgent(
            name="researcher",
            model_client=model,
            workbench=workbench,
            system_message=worker_prompt(
                agent_name="researcher",
                project_id=project_id,
                namespace=namespace,
                phase=initial_phase,
                task_type="research",
            ),
            reflect_on_tool_use=True,
        )
        implementer = AssistantAgent(
            name="implementer",
            model_client=model,
            workbench=workbench,
            system_message=worker_prompt(
                agent_name="implementer",
                project_id=project_id,
                namespace=namespace,
                phase=initial_phase,
                task_type="implementation",
            ),
            reflect_on_tool_use=True,
        )
        reviewer = AssistantAgent(
            name="reviewer",
            model_client=model,
            workbench=workbench,
            system_message=worker_prompt(
                agent_name="reviewer",
                project_id=project_id,
                namespace=namespace,
                phase=initial_phase,
                task_type="review",
            ),
            reflect_on_tool_use=True,
        )

        # --- Orchestrator ---
        orchestrator = AssistantAgent(
            name="orchestrator",
            model_client=model,
            workbench=workbench,
            system_message=orchestrator_prompt(
                project_id=project_id,
                namespace=namespace,
                phase=initial_phase,
                agent_names=["researcher", "implementer", "reviewer"],
            ),
            reflect_on_tool_use=True,
        )

        # --- SelectorGroupChat: orchestrator picks the next speaker ---
        team = SelectorGroupChat(
            participants=[orchestrator, researcher, implementer, reviewer],
            model_client=model,
            selector_prompt=(
                "You are managing a project team.\n"
                "The orchestrator analyzes MindBrain projections and says "
                "ACTIVATE: <agent_name>. Select that agent next.\n"
                "If the orchestrator says WAIT or PROJECT_COMPLETE, select the orchestrator again.\n"
                "Participants: {participants}\n"
                "Recent conversation:\n{history}\n"
                "Select the next speaker:"
            ),
            termination_condition=(
                TextMentionTermination("PROJECT_COMPLETE")
                | MaxMessageTermination(120)
            ),
        )

        full_task = (
            f"Project ID: `{project_id}` | Namespace: `{namespace}` | Phase: {initial_phase}\n\n"
            f"{initial_task}"
        )
        await team.run(task=full_task)
```


***

## Knowledge Graph Usage

When agents build a knowledge graph (not a project), the same tools apply
but the entity/relation model is domain-specific.

### Example: technical knowledge graph

```python
# Schema declared once at project start (via ghostcrab-architect skill)
# Entity types:  concept, document, decision, requirement, component
# Relation types: concept RELATES_TO concept
#                 decision IMPLEMENTS requirement
#                 component DEPENDS_ON component
#                 document DOCUMENTS decision

# Worker agent recording a decision:
await workbench.call_tool("ghostcrab_knowledge_add", {
    "namespace": namespace,
    "content": "Use pg_facets for faceted search — PostgreSQL-native, no external index.",
    "source_task_id": "task-arch-001",
    "tags": ["architecture", "database", "search"],
})

# Link decision to requirement entity:
await workbench.call_tool("ghostcrab_edge_create", {
    "namespace": namespace,
    "relation_name": "IMPLEMENTS",
    "from_id": "decision-faceted-search",
    "to_id": "req-search-performance",
})
```


### Querying the knowledge graph (any agent)

```python
# Semantic search across all knowledge
result = await workbench.call_tool("ghostcrab_query", {
    "namespace": namespace,
    "query": "search performance decisions",
    "mode": "semantic",
    "k": 5,
})

# Faceted search — filter by tags
result = await workbench.call_tool("ghostcrab_facet_search", {
    "namespace": namespace,
    "facets": {"tags": ["architecture"], "type": "decision"},
    "limit": 10,
})

# Graph traversal — what does this component depend on?
result = await workbench.call_tool("ghostcrab_graph_traverse", {
    "namespace": namespace,
    "start_id": "component-api-gateway",
    "relation_name": "DEPENDS_ON",
    "depth": 3,
})
```


***

## Orchestrator Decision Examples

### Reading task_summary projection

```python
summary = await workbench.call_tool("ghostcrab_pragma_query", {
    "namespace": namespace,
    "projection": "task_summary",
})
# Returns:
# {
#   "phase": "BUILDING",
#   "total": 12,
#   "by_status": {
#     "PENDING": 3, "IN_PROGRESS": 4, "BLOCKED": 2, "DONE": 3, "FAILED": 0
#   }
# }
```


### Reading phase_readiness projection

```python
readiness = await workbench.call_tool("ghostcrab_pragma_query", {
    "namespace": namespace,
    "projection": "phase_readiness",
    "filters": {"project_id": project_id},
})
# Returns:
# {
#   "current_phase": "BUILDING",
#   "next_phase": "REVIEW",
#   "score": 88,           # >= 85 triggers transition
#   "blocking_factors": [] # empty = clear to transition
# }
```


### Triggering a phase transition

```python
if readiness["score"] >= 85:
    await workbench.call_tool("ghostcrab_phase_transition", {
        "namespace": namespace,
        "project_id": project_id,
        "to_phase": readiness["next_phase"],
        "reason": f"Phase readiness score reached {readiness['score']}.",
    })
```


### Signaling an agent

```python
# Resume an idle agent
await workbench.call_tool("ghostcrab_agent_signal", {
    "namespace": namespace,
    "agent_name": "researcher",
    "signal": "RESUME",
    "context": "3 PENDING research tasks are waiting.",
})

# Stop an overloaded agent
await workbench.call_tool("ghostcrab_agent_signal", {
    "namespace": namespace,
    "agent_name": "implementer",
    "signal": "PAUSE",
    "context": "Waiting for review to catch up before adding more work.",
})
```


***

## Project Lifecycle Patterns

### Pattern A — Sequential phases (waterfall-style)

```
PLANNING → BUILDING → REVIEW → DELIVERY → CLOSED
```

The orchestrator checks `phase_readiness` after each DONE task.
Phase transition fires when score >= 85.
In REVIEW phase, `reviewer` agent is the primary speaker.

### Pattern B — Parallel phases (iterative)

```
PLANNING  →  BUILDING + REVIEW (parallel)  →  DELIVERY
```

Achieved by creating tasks with `phase="BUILDING"` and `phase="REVIEW"` simultaneously.
The orchestrator uses `agent_load` to balance work between implementer and reviewer.

### Pattern C — Knowledge graph build + project combined

```
PLANNING (define schema via ghostcrab-architect skill)
  → BUILDING (agents populate entities + edges)
  → REVIEW (reviewer validates graph completeness via ghostcrab_graph_traverse)
  -> DELIVERY (ghostcrab_snapshot_export)
```


***

## Project Setup (before running the team)

Run this once before starting agents.

```python
# ghostcrab/autogen/setup.py
import asyncio
from autogen_ext.tools.mcp import McpWorkbench
from ghostcrab.autogen.connection import sse_params


async def setup_project(
    namespace: str,
    project_id: str,
    description: str,
    initial_tasks: list[dict],
) -> None:
    """
    Initializes a MindBrain namespace and seeds initial tasks.
    Call once before run_project().

    initial_tasks: list of {
        task_id: str,
        title: str,
        type: str,            # "research" | "implementation" | "review"
        assignee: str,        # agent name
        phase: str,           # "PLANNING" | "BUILDING" | ...
        depends_on?: [str],   # optional list of task_ids
    }
    """
    async with McpWorkbench(sse_params()) as wb:
        # 1. Init namespace
        await wb.call_tool("ghostcrab_namespace_init", {
            "namespace": namespace,
            "description": description,
        })

        # 2. Create project entity
        await wb.call_tool("ghostcrab_entity_create", {
            "namespace": namespace,
            "type_name": "project",
            "entity_id": project_id,
            "attributes": {
                "name": description,
                "phase": "PLANNING",
                "created_at": "now()",
            },
        })

        # 3. Create initial tasks
        for task in initial_tasks:
            await wb.call_tool("ghostcrab_task_create", {
                "namespace": namespace,
                "task_id": task["task_id"],
                "title": task["title"],
                "type": task["type"],
                "assignee": task["assignee"],
                "phase": task["phase"],
            })
            # Set initial status
            await wb.call_tool("ghostcrab_task_status_set", {
                "namespace": namespace,
                "task_id": task["task_id"],
                "status": "PENDING",
            })

        # 4. Create dependency edges
        for task in initial_tasks:
            for dep_id in task.get("depends_on", []):
                await wb.call_tool("ghostcrab_edge_create", {
                    "namespace": namespace,
                    "relation_name": "DEPENDS_ON",
                    "from_id": task["task_id"],
                    "to_id": dep_id,
                })

        print(f"Project {project_id} initialized in namespace {namespace}.")
```


***

## Testing

### Unit test — orchestrator decision logic

```python
# tests/unit/test_orchestrator_decisions.py
import pytest
import json
from unittest.mock import AsyncMock
from autogen_core.tools import ToolResult, TextResultContent


def make_workbench(projection_data: dict) -> AsyncMock:
    wb = AsyncMock()

    async def call_tool(name, arguments=None, **_):
        if name == "ghostcrab_pragma_query":
            proj = (arguments or {}).get("projection", "")
            payload = projection_data.get(proj, {})
        else:
            payload = {"ok": True}
        return ToolResult(
            name=name,
            result=[TextResultContent(content=json.dumps(payload))],
            is_error=False,
        )

    wb.call_tool.side_effect = call_tool
    return wb


@pytest.mark.asyncio
async def test_phase_transition_when_ready():
    wb = make_workbench({
        "task_summary": {"by_status": {"DONE": 10, "PENDING": 0, "IN_PROGRESS": 0}},
        "phase_readiness": {"current_phase": "BUILDING", "next_phase": "REVIEW", "score": 90},
    })
    readiness = await wb.call_tool("ghostcrab_pragma_query", {"projection": "phase_readiness"})
    data = json.loads(readiness.result[0].content)
    assert data["score"] >= 85
    # Orchestrator should now call ghostcrab_phase_transition
    await wb.call_tool("ghostcrab_phase_transition", {
        "namespace": "test",
        "project_id": "proj-001",
        "to_phase": "REVIEW",
    })
    calls = [c.args[0] for c in wb.call_tool.call_args_list]
    assert "ghostcrab_phase_transition" in calls


@pytest.mark.asyncio
async def test_agent_signal_on_blocked_tasks():
    wb = make_workbench({
        "blockers": {"blocked_tasks": [{"task_id": "t-3", "blocked_by": "t-1", "assignee": "implementer"}]},
    })
    blockers = await wb.call_tool("ghostcrab_pragma_query", {"projection": "blockers"})
    data = json.loads(blockers.result[0].content)
    assert len(data.get("blocked_tasks", [])) >= 1
```
<span style="display:none">[^4_1][^4_10][^4_11][^4_12][^4_13][^4_14][^4_15][^4_2][^4_3][^4_4][^4_5][^4_6][^4_7][^4_8][^4_9]</span>

<div align="center">⁂</div>

[^4_1]: https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/mixture-of-agents.html
[^4_2]: https://www.linkedin.com/posts/shailender-choudhary_understand-microsoft-autogen-04-with-a-mini-activity-7288891049358307328-cgBG
[^4_3]: https://learn.microsoft.com/en-us/agent-framework/migration-guide/from-autogen/
[^4_4]: https://github.com/microsoft/autogen/discussions/4208
[^4_5]: https://genmind.ch/posts/Multi-Agent-Orchestration-Patterns-Building-Collaborative-AI-Teams/
[^4_6]: https://github.com/aanari/pg-materialize
[^4_7]: https://www.datacamp.com/tutorial/autogen-tutorial
[^4_8]: https://newsletter.victordibia.com/p/a-friendly-introduction-to-the-autogen
[^4_9]: https://stackoverflow.com/questions/71433083/stored-procedure-in-pgsql-to-create-materialized-views
[^4_10]: https://www.microsoft.com/en-us/research/blog/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/
[^4_11]: https://www.cohorte.co/blog/autogen-v0-4-ag2-crash-course-build-event-driven-observable-ai-agents-that-scale
[^4_12]: https://www.reddit.com/r/PostgreSQL/comments/rm2zmx/is_this_an_appropriate_use_case_for_a/
[^4_13]: https://deepfa.ir/en/blog/autogen-microsoft-multi-agent-ai-framework
[^4_14]: https://microsoft.github.io/autogen/0.4.2/user-guide/agentchat-user-guide/tutorial/teams.html
[^4_15]: https://www.postgresql.org/docs/current/rules-materializedviews.html
