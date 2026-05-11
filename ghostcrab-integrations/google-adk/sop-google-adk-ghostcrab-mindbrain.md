<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

The most effective pitch for every framework is not to sell MindBrain as an "alternative database" but as a **shared context layer across agents**: today each framework keeps memory in silos; MindBrain/GhostCrab provides a structured, queryable, persistent ontology registry. That argument lands regardless of target framework.

task: target Google ADK — explain how integration should be implemented with this framework.

Solid technical base below for a precise answer on MindBrain/GhostCrab integration with Google ADK.

## MindBrain/GhostCrab integration with Google ADK

Direct angle: Google ADK exposes a `BaseMemoryService` interface you implement. MindBrain becomes the backend for that interface — placing GhostCrab exactly where ADK expects a persistent, queryable context registry.

***

## ADK architecture: where MindBrain fits

Google ADK cleanly separates three context layers [^1_1] :

- **Session/State** — short-lived, intra-session memory
- **MemoryService** — long-lived, cross-session memory queried via `search_memory()`
- **Artifacts** — large blobs tied to a session, addressed by name

MindBrain targets **`MemoryService`**. That is the layer that lacks ontology structure out of the box: ADK offers `InMemoryMemoryService` (keyword matching, non-persistent), `VertexAiMemoryBankService` (LLM-extracted, cloud-only), and `VertexAiRagMemoryService` (vector similarity) [^1_2]. **None provides a typed, faceted ontology registry.**

***

## Main integration point: `BaseMemoryService`

ADK defines four operations [^1_2] :

```python
class BaseMemoryService:
    async def add_session_to_memory(session: Session) -> None
    async def add_events_to_memory(events: list[Event]) -> None  # optionnel
    async def add_memory(entry: MemoryEntry) -> None            # optionnel
    async def search_memory(app_name, user_id, query) -> SearchMemoryResponse
```

Implement `MindBrainMemoryService(BaseMemoryService)` on the server in Go (exposed via HTTP/gRPC), with a Python ADK wrapper delegating to GhostCrab MCP or MindBrain HTTP. Turn `search_memory()` into faceted ontology queries — structurally richer than pure vector search.

***

## Deployment and Runner wiring

ADK `Runner` accepts `memory_service` [^1_3] :

```python
from google.adk.runners import Runner

runner = Runner(
    agent=my_agent,
    app_name="my_app",
    session_service=session_service,
    memory_service=MindBrainMemoryService(endpoint="http://mindbrain:8080")
)
```

For Cloud Run deployments, ADK accepts `--memory_service_uri` pointing at your external endpoint [^1_3]. MindBrain runs as a sidecar or dedicated service — no Vertex lock-in.

***

## Two memory-access patterns from agents

Expose both via GhostCrab [^1_2] :

- **`PreloadMemoryTool`** — injects ontology context *before* each LLM call (proactive): good when agents share a knowledge base
- **`LoadMemoryTool`** — agent chooses when to query MindBrain (reactive): good for exploratory agents

```python
from google.adk.tools.preload_memory_tool import PreloadMemoryTool

agent = LlmAgent(
    model="gemini-2.5-flash",
    name="orchestrator_agent",
    tools=[PreloadMemoryTool()],  # → appelle search_memory() → GhostCrab
    after_agent_callback=auto_save_to_mindbrain_callback
)
```


***

## Automatic ingestion via callback

Automate MindBrain ingestion at session end with `after_agent_callback` [^1_2] :

```python
async def auto_save_to_mindbrain_callback(callback_context):
    await callback_context.add_session_to_memory()
    # → MindBrainMemoryService.add_session_to_memory()
    # → ontology mapping of session events into MindBrain
```

Differentiator vs `VertexAiMemoryBankService`: store typed ontology entities instead of dumping raw text.

***

## Differentiation vs native ADK options

| Capability | InMemoryMemoryService | VertexAiMemoryBankService | **MindBrain via GhostCrab** |
| :-- | :-- | :-- | :-- |
| Cross-session persistence | ✗ | ✓ (cloud) | ✓ (PostgreSQL) |
| Structured / faceted search | ✗ | ✗ | ✓ |
| Ontology-typed entities | ✗ | ✗ | ✓ |
| Shared multi-agent context | ✗ (silo) | partial | ✓ (single registry) |
| Self-hosted / air-gap | ✓ | ✗ | ✓ |
| Hybrid queries (graph + facets) | ✗ | ✗ | ✓ |

Talking point for ADK: Google describes `MemoryService` as “long-lived, searchable knowledge that outlives a single session” [^1_1] — that matches MindBrain’s ontology registry. You do not replace ADK; you supply the structured implementation ADK cannot build alone.

***

## Full integration flow

```
ADK Agent (LlmAgent)
    │
    ├── PreloadMemoryTool → search_memory(query)
    │       └── MindBrainMemoryService.search_memory()
    │               └── GhostCrab MCP → pg_facets + pg_dgraph query
    │
    ├── [Tool execution] → after_tool_callback
    │       └── capture context → incremental ontology enrichment
    │
    └── after_agent_callback → add_session_to_memory()
            └── MindBrainMemoryService.add_session_to_memory()
                    └── entity extraction + ontology mapping → MindBrain
```

Immediate path: implement `MindBrainMemoryService` as a thin Python wrapper over GhostCrab — ADK surface is minimal (two core methods), while positioning is strong because you plug the only slot ADK leaves unfilled natively.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/

[^1_2]: https://adk.dev/sessions/memory/

[^1_3]: https://github.com/google/adk-python/discussions/2548

[^1_4]: https://cloud.google.com/blog/topics/developers-practitioners/remember-this-agent-state-and-memory-with-adk

[^1_5]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/adk-quickstart

[^1_6]: https://milvus.io/blog/how-to-build-productionready-ai-agents-with-longterm-memory-using-google-adk-and-milvus.md

[^1_7]: https://codelabs.developers.google.com/adkcourse/instructions

[^1_8]: https://www.reddit.com/r/agentdevelopmentkit/comments/1nfvfua/custom_session_service_adk_integration_issue/

[^1_9]: https://dev.to/masahide/smarter-adk-prompts-inject-state-and-artifact-data-dynamically-placeholders-2dcm

[^1_10]: https://www.linkedin.com/pulse/context-engineering-google-adk-ultimate-guide-ai-olamendy-turruellas-6xrpe

[^1_11]: https://github.com/google/adk-samples/issues/113

[^1_12]: https://discuss.google.dev/t/how-to-build-ai-agents-with-long-term-memory-using-vertex-ai-memory-bank-adk/193013

[^1_13]: https://www.reddit.com/r/AI_Agents/comments/1krex35/google_adk_artifact_purpose/

[^1_14]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/adk-quickstart?hl=zh-tw

[^1_15]: https://seroter.com/2025/10/14/how-to-build-and-deploy-a-portable-ai-agent-that-uses-a-managed-memory-service/


---

# Start with GhostCrab MCP Personal (SQLite) — the free trial build for local MindBrain testing.

Below: full integration focused on GhostCrab SQLite over **stdio**, the simplest transport for local testing.

## GhostCrab MCP (SQLite) with Google ADK

Local integration uses ADK **stdio** transport: the framework launches GhostCrab as a subprocess over stdin/stdout. Zero network ports, no external service — all local. [^2_1][^2_2]

***

## Project layout

```
ghostcrab-adk-demo/
├── .env
├── agent.py
├── __init__.py
└── mindbrain.db          ← SQLite DB created on first run
```


***

## Step 1 — Prerequisites

```bash
pip install google-adk mcp python-dotenv
```

`.env` :

```env
GOOGLE_API_KEY=your_gemini_api_key
MINDBRAIN_DB_PATH=./mindbrain.db
```

Build or install GhostCrab SQLite and expose it on PATH or via absolute path :

```bash
# if installed with Go
go install github.com/your-org/ghostcrab@latest

# or absolute path
export GHOSTCRAB_BIN=./bin/ghostcrab-sqlite
```


***

## Step 2 — `agent.py`: stdio connection to GhostCrab

ADK supports `StdioConnectionParams` launching the MCP binary as a subprocess [^2_3][^2_1] :

```python
import os
import asyncio
from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StdioConnectionParams
from mcp.client.stdio import StdioServerParameters

load_dotenv()

# stdio connection → GhostCrab SQLite
ghostcrab_toolset = MCPToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command=os.getenv("GHOSTCRAB_BIN", "ghostcrab"),
            args=[
                "--transport", "stdio",
                "--db",        os.getenv("MINDBRAIN_DB_PATH", "./mindbrain.db"),
            ],
            env={
                "MINDBRAIN_DB_PATH": os.getenv("MINDBRAIN_DB_PATH", "./mindbrain.db"),
            }
        ),
        timeout=30
    )
)

# Agent using GhostCrab tools as shared context
root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="mindbrain_agent",
    instruction="""
    You have structured ontology access through GhostCrab (MindBrain).
    Use the available tools to:
    - Store typed entities, relations, and facts
    - Query the registry by facets, entity type, or relations
    - Share that context across agents with durable persistence
    Always ground answers on the registry before free-form reasoning.
    """,
    tools=[ghostcrab_toolset],
)
```


***

## Step 3 — `__init__.py`: ADK entrypoint

```python
from . import agent
```


***

## Step 4 — Launch the ADK web dev UI

```bash
adk web
```

ADK serves at `http://localhost:8000` [^2_4]. It spawns the GhostCrab subprocess on first agent invocation. `mindbrain.db` is created if missing.

CLI-only test :

```bash
adk run ghostcrab-adk-demo
```


***

## GhostCrab MCP tools exposed to ADK

ADK loads GhostCrab’s MCP manifest at startup (`tools/list`) [^2_3]. With GhostCrab SQLite you typically see :

| GhostCrab MCP tool | Role in ADK |
| :-- | :-- |
| `store_entity` | Persist typed entity in MindBrain |
| `query_facets` | Faceted search (types, attributes) |
| `get_relations` | Traverse relation graph |
| `search_context` | Hybrid semantic + structured search |
| `list_types` | Ontology introspection |

ADK surfaces them as native Gemini function calls — no manual declaration.

***

## Step 5 — Opt into `BaseMemoryService` (next step)

Stdio MCP is enough to validate tools. When GhostCrab should act as **structured long-term memory** (cross-session, auto-injected before each LLM call), wire `MindBrainMemoryService` on `Runner`:

```python
runner = Runner(
    agent=root_agent,
    app_name="mindbrain_demo",
    session_service=InMemorySessionService(),
    memory_service=MindBrainMemoryService(toolset=ghostcrab_toolset),  # next step
)
```

For local SQLite tests, `InMemorySessionService` is enough — persistence lives in MindBrain, not ADK sessions. [^2_5]

***

## Debugging

```bash
# Inspect GhostCrab tools before launching ADK
npx @modelcontextprotocol/inspector ghostcrab --transport stdio --db ./mindbrain.db

# Verbose ADK logs
adk run ghostcrab-adk-demo --verbosity=DEBUG
```

Minimal validation path: user message → Gemini calls `store_entity` via GhostCrab → `mindbrain.db` updates → `query_facets` returns the entity within the same or a later session. That proves persistent shared context [^2_4][^2_2].
<span style="display:none">[^2_10][^2_11][^2_12][^2_13][^2_14][^2_15][^2_16][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://qiita.com/s-kato-iret/items/c89c904ec63048b04145

[^2_2]: https://www.youtube.com/watch?v=nR-3_Jgn168

[^2_3]: https://adk.dev/tools-custom/mcp-tools/

[^2_4]: https://cloud.google.com/blog/topics/developers-practitioners/use-google-adk-and-mcp-with-an-external-server

[^2_5]: https://adk.dev/sessions/memory/

[^2_6]: https://codelabs.developers.google.com/codelabs/cloud-run/use-mcp-server-on-cloud-run-with-an-adk-agent

[^2_7]: https://github.com/google/adk-docs/issues/466

[^2_8]: https://www.datacamp.com/tutorial/google-adk-mcp-tutorial

[^2_9]: https://ravichaganti.com/blog/google-adk-mcp-tools/

[^2_10]: https://github.com/google/adk-python/discussions/2034

[^2_11]: https://dev.to/timtech4u/building-ai-agents-with-google-adk-fastapi-and-mcp-26h7

[^2_12]: https://caseywest.com/building-scalable-ai-agents-a-deep-dive-into-decoupled-tools-with-adk-mcp-and-cloud-run

[^2_13]: https://codelabs.developers.google.com/codelabs/currency-agent

[^2_14]: https://github.com/google/adk-python/discussions/4289

[^2_15]: https://www.youtube.com/watch?v=kmKb5HzjLZI

[^2_16]: https://arjunprabhulal.com/adk-mcp-deep-dive/


---

# `skill.md` for ontology bootstrap with GhostCrab-architect (Google ADK agent)

Available for download.

The skill spans the bootstrap lifecycle in six sequential phases:

**Skill outline:**

- **Phase 0** — MCP discovery (`list_tools()` before any mutation; assume nothing)
- **Phase 1** — domain intake, gated until ≥2 types + ≥1 relation
- **Phase 2** — `create_type()` with systematic session logging
- **Phase 3** — `add_attribute()` with auto-typing heuristics and confirmation prompts
- **Phase 4** — `add_relation()` with explicit cardinality decision tree and mandatory confirmation on `many_to_many`
- **Phase 5** — `validate_schema()` exhausting errors/warnings
- **Phase 6** — `export_schema()` + standardized Markdown bootstrap report

**Design notes:**

- GhostCrab error taxonomy (`TYPE_ALREADY_EXISTS`, `DB_LOCKED`, etc.) yields deterministic retries without extra prompts
- SQLite vs PostgreSQL limits documented — users understand local vs migrated behavior
- System instructions enforce ordering: types → attributes → relations, avoiding slug errors inside `add_relation`

---

# General-purpose `skill.md` for ADK agent operations — e.g. project management or knowledge graphs — where agents record/manage status on progressing items (project case), orchestrators consume **PG_Pragma** projections to organize agents, restart/stop them, advance project phases, etc.

File ready.

This skill differs fundamentally from the prior one: **`ghostcrab-architect`** built schema once; **`ghostcrab-runtime`** governs ongoing agent operation. Structural choices:

**Worker vs orchestrator split**  
Separate MCP surfaces. Workers cannot call `advance_phase()` or `suspend_agent()` — enforced by GhostCrab, not prompting — preventing accidental supervisory actions from subordinate agents.

**`pg_pragma` as orchestrator nervous system**  
Projections (`phase_readiness`, `agent_load`, `critical_path`, `health_score`) drive decisions; the orchestrator reads pre-materialized views instead of recomputing from scratch. Difference between an LLM “thinking” and an orchestrator **reading a registry and deciding**. SQLite projection limits are spelled out with manual fallbacks.

**Normalized statuses as an inter-agent protocol**  
Closed status sets (`pending`, `in_progress`, `blocked`, `done`, …) are protocol — not conventions. Inventing `"wip"`/`"finished"` breaks `phase_readiness`; the skill warns agents not to drift.

**Documented failure patterns**  
Silent agents, dependency deadlocks, knowledge-node conflicts — each includes exact mitigation code paths so supervisors do not improvise.
