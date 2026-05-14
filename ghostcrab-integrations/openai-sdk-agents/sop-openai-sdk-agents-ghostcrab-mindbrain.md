# Integrating mindBrain with OpenAI Agents SDK

## About OpenAI Agents SDK

The [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) is an official SDK for building agentic applications with agents, tools, handoffs, guardrails, tracing, and MCP server connections. It gives developers a structured runtime for composing agents around OpenAI models while keeping tool calls and orchestration explicit in application code. Teams use it when they want production-grade agent behavior without building every execution primitive from scratch.

## MindBrain

MindBrain is a structured agentic database that makes any domain navigable in real time — its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time.

## Why integrate mindBrain with OpenAI Agents SDK

The Agents SDK has clear primitives for local context, model-visible context, sessions, and MCP tools, but durable shared memory across multiple agents and runs still has to be designed by the application. mindBrain fills that gap as a structured ontology registry that every SDK agent can reach through GhostCrab MCP tools.

With mindBrain attached through the SDK's MCP server support, agents can load compact workspace context at run start, query typed relationships on demand, and update current state without embedding persistence logic in each tool. The SDK keeps orchestrating agents and tool calls; mindBrain provides shared, queryable memory and zero-inference projections across runs.

## SKILLS available in this repo

- [`SKILL_ghostcrab-openai-agents-sdk.md`](SKILL_ghostcrab-openai-agents-sdk.md) helps Claude Code or Codex connect the OpenAI Agents SDK to GhostCrab Personal as a local MCP memory layer.
- [`SKILL_ghostcrab-runtime-openai-agents-sdk.md`](SKILL_ghostcrab-runtime-openai-agents-sdk.md) guides runtime agents through reading packs, searching memory, and writing durable state during SDK runs.
- [`SKILL_ghostcrab-architect-ontology-bootstrap.md`](SKILL_ghostcrab-architect-ontology-bootstrap.md) helps Claude Code or Codex evolve a real OpenAI Agents SDK workflow into a deliberate mindBrain workspace model.

## How the SDK manages context (and limits)

SDK splits context [^1_1]:

- **Local context** (`RunContextWrapper`): Python object passed into tools/hooks, **never sent to the LLM**, lost when the run ends
- **LLM context**: model-visible conversation only; injecting data happens through `instructions`, `input`, or **function tools**

Cross-run strategies include `result.history` (local replay), `session` (application storage), `conversationId`, or `previousResponseId` (OpenAI hosted) [^1_2]. None provides **structured, queryable knowledge shared among distinct agents.**

***

## Natural entrypoint: MCP via `mcp_servers`

The SDK attaches MCP servers through `Agent(mcp_servers=[...])`. MCP tools expose automatically — GhostCrab matches that surface.

### Recommended transport

Run GhostCrab locally or self-hosted → use `MCPServerStreamableHttp` :

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async with MCPServerStreamableHttp(
    name="GhostCrab",
    params={
        "url": "http://localhost:8080/mcp",   # endpoint GhostCrab
        "headers": {"Authorization": f"Bearer {token}"},
    },
    cache_tools_list=True,   # les tool definitions sont stables
) as ghostcrab:
    agent = Agent(
        name="Analyst",
        instructions="Use GhostCrab to read and update the shared ontological context.",
        mcp_servers=[ghostcrab],
    )
    result = await Runner.run(agent, "What entities are related to project X?")
```

`cache_tools_list=True` makes sense — GhostCrab tool schemas rarely change mid-run .

***

## Three-layer integration sketch

### 1. Static injection via `instructions`

Freeze an **ontology snapshot** at run start — key entities, critical relations :

```python
async def build_instructions(wrapper: RunContextWrapper) -> str:
    snapshot = await ghostcrab_client.get_context_snapshot(wrapper.context.session_id)
    return f"""You are an agent with access to a shared ontological context.
Current known entities: {snapshot}
Use GhostCrab tools to query or update this context."""
```

Solves cold start: agents begin with ontology context preload [^1_3].

### 2. On-demand access via MCP function tools

Handle faceted lookups or traversals lazily via GhostCrab. The SDK routes tool calls straight to MCP. Typical tools :

- `search_entities(facets, filters)` → faceted MindBrain query
- `get_relationships(entity_id, depth)` → pg_dgraph traversal
- `upsert_entity(type, properties)` → ontology writes


### 3. `tool_meta_resolver` for tenant/session scoping

When multiple agents reuse one GhostCrab but separate tenants/workflows, propagate `session_id` or `workspace_id` through MCP `_meta` :

```python
from agents.mcp import MCPServerStreamableHttp, MCPToolMetaContext

def resolve_meta(context: MCPToolMetaContext) -> dict:
    run_ctx = context.run_context.context or {}
    return {
        "workspace_id": run_ctx.get("workspace_id"),
        "agent_id": run_ctx.get("agent_id"),
    }

server = MCPServerStreamableHttp(
    name="GhostCrab",
    params={"url": "http://localhost:8080/mcp"},
    tool_meta_resolver=resolve_meta,
)
```


***

## Tool filtering by agent role

In multi-agent systems, grant different ontology rights per agent using `tool_filter` :

```python
from agents.mcp import create_static_tool_filter

# Agent lecteur seul
reader_server = MCPServerStreamableHttp(
    name="GhostCrab-readonly",
    params={"url": "http://localhost:8080/mcp"},
    tool_filter=create_static_tool_filter(
        allowed_tool_names=["search_entities", "get_relationships"]
    ),
)

# Writer / orchestrator: full MCP surface
writer_server = MCPServerStreamableHttp(
    name="GhostCrab-writer",
    params={"url": "http://localhost:8080/mcp"},
)
```


***

## Positioning takeaway

| Native SDK gaps | GhostCrab fix |
| :-- | :-- |
| Local `RunContext`, lost post-run [^1_3] | PostgreSQL state survives runs |
| In-memory sessions siloed per agent [^1_2] | Shared registry across heterogeneous agents |
| No structured querying on memory | Faceted search + traversal via MindBrain |
| Untyped context blobs | Explicit ontology schemas |

Agents SDK code stays untouched — GhostCrab is a declarative `mcp_server`; the agent consumes its tools normally. Shared ontology moves from bespoke hacks to packaged dependency declarations.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://openai.github.io/openai-agents-js/guides/context/

[^1_2]: https://developers.openai.com/api/docs/guides/agents/running-agents

[^1_3]: https://openai.github.io/openai-agents-python/context/

[^1_4]: https://developers.openai.com/cookbook/examples/agents_sdk/session_memory

[^1_5]: https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization

[^1_6]: https://github.com/openai/openai-agents-python/issues/832

[^1_7]: https://blog.getzep.com/building-a-memory-agent-with-the-openai-agents-sdk-and-zep/

[^1_8]: https://www.youtube.com/watch?v=BPEOxC6lVgU

[^1_9]: https://www.ema.ai/additional-blogs/addition-blogs/initialize-ai-agent-memory-openai-sdk

[^1_10]: https://openai.github.io/openai-agents-python/mcp/

[^1_11]: https://hindsight.vectorize.io/blog/2026/04/17/openai-agents-persistent-memory

[^1_12]: https://www.digitalocean.com/community/tutorials/how-to-use-mcp-with-openai-agents

[^1_13]: https://callsphere.ai/blog/shared-state-multi-agent-systems-coordinating-data-between-agents

[^1_14]: https://supermemory.ai/docs/integrations/openai-agents-sdk

[^1_15]: https://dev.to/seratch/openai-agents-sdk-multiple-mcp-servers-8d2


---

# `skill.md` for Codex: GhostCrab MCP + MindBrain on OpenAI Agents SDK

`ghostcrab-openai-agents-sdk.md` (linked above) captures the export.

## Scope

285 lines across ten operational slices:

- **Connectivity** — exact knobs for `MCPServerStreamableHttp` (prod) and `MCPServerStdio` (dev/tests)
- **Callable instructions** — `build_instructions(wrapper)` pattern for ontology snapshots at run start
- **`tool_filter`** — read/write isolation per agent role (`create_static_tool_filter`)
- **`tool_meta_resolver`** — MCP `_meta` routing for `workspace_id` / `session_id`
- **GhostCrab contract table** — six tools + key parameters
- **Multi-agent vignette** — `Analyst → Writer` on shared workspace
- **Lifecycle** — warns against per-run MCP churn
- **Error handling** — `AgentsException`, GhostCrab remediation tips for LLMs
- **Environment matrix** — exhaustive env reference

Written for Codex: every unit is copy/paste runnable and names failure modes. Depends only on the official Agents SDK.

---

# `skill.md` for ontology bootstrap (GhostCrab-architect, Codex)

`ghostcrab-architect-ontology-bootstrap.md` clocks in at ~363 lines.

## Highlights

**Architect vs runtime** — two URIs, ports, tokens, scopes; Codex cannot confuse duties.

**Five architect tools**, each with JSON payload + response samples:

- `define_type` — flat T-Box, max depth 2
- `define_property` — facetable / traversable / searchable flags and pg routing
- `define_relation` — directed edges + traversal hints
- `define_constraint` — `check`, `unique_together`, cardinality bounds
- `inspect_schema` / `validate_schema` — pre/post gates

**Linear pipeline** — types → properties → relations → constraints → validate (no fan-out).

**System prompt pack** — ontology style rules (names, mandatory ids, flat structs, timestamps, …).

**Workspace migration modes** — additive / reset / diff; `reset_workspace` is never implicit.

---

# General `ghostcrab-runtime` draft (originally requested in an ADK framing — out of scope here)

Applies to OpenAI Agents SDK agents, **not** Google ADK.

Placeholder: *Answer skipped.*

---

# General `ghostcrab-runtime` skill for OpenAI Agents SDK agents

Project management, collaborative KGs, PG_Pragma-driven supervision, etc.

Delivered as `ghostcrab-runtime-openai-agents-sdk.md` (~442 lines).

## Highlights

**Indirect coordination diagram** — teammates never whisper; MindBrain is the lone shared truth ASCII for Codex.

**Two starter ontologies** — PM rails (`Project → Phase → Task → Agent`) and KG rails (`Concept → Claim → Source → Tag`) with confidence fields.

**pg_pragma as orchestrator cortex** — four projections with illustrative payloads (`project_dashboard`, `agent_health`, `phase_readiness`, `knowledge_graph_coverage`).

**Six supervisory branches** — restart stale workers, unblock work, redeploy idle agents, advance phases, mark completion, deadlock pause.

**Worker heartbeat appendix** documenting `append_event` taxonomy (twelve audited families).

**Anti-pattern grid** documenting the quickest ways projection consumers break workflows (and mitigation).

<span style="display:none">[^3_1][^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_2][^3_3][^3_4][^3_5][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://palantir.com/docs/foundry/ontology-mcp/mcp-tools-and-agent-configuration/

[^3_2]: https://github.com/punkpeye/awesome-mcp-servers/blob/main/README.md

[^3_3]: https://arxiv.org/pdf/2602.03439.pdf

[^3_4]: https://dlthub.com/blog/ai-workbench

[^3_5]: https://www.themoonlight.io/fr/review/ontology-to-tools-compilation-for-executable-semantic-constraint-enforcement-in-llm-agents

[^3_6]: https://dev.to/farooquememon385/popular-graph-extensions-to-postgresql-49kd

[^3_7]: https://dev.to/aws-heroes/mcp-tool-design-why-your-ai-agent-is-failing-and-how-to-fix-it-40fc

[^3_8]: https://dev.to/tigerdata/postgresql-extensions-what-they-are-and-how-to-use-them-4i76

[^3_9]: https://modelcontextprotocol.io/specification/draft/server/tools

[^3_10]: https://grafbase.com/extensions/postgres

[^3_11]: https://towardsai.net/p/l/i-used-mcp-for-3-months-everything-you-need-to-know-24-best-servers-new-anthropic-dtx-extensions

[^3_12]: https://www.postgresql.org/docs/current/extend-extensions.html

[^3_13]: https://www.anthropic.com/engineering/code-execution-with-mcp

[^3_14]: https://wiki.postgresql.org/wiki/Extensions

[^3_15]: https://openai.github.io/openai-agents-python/mcp/
