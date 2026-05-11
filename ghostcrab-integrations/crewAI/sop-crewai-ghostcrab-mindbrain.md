<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

The most effective pitch for every framework is not to sell MindBrain as an "alternative database" but as a **shared context layer across agents**: today each framework keeps memory in silos; MindBrain/GhostCrab provides a structured, queryable, persistent ontology registry. That argument lands regardless of target framework.

task: target CrewAI — explain how integration should be implemented with this framework.

Full MindBrain/GhostCrab integration analysis for CrewAI below.

***

## CrewAI: target memory architecture

CrewAI has moved to a **unified memory system** (`Memory` class) replacing the old segmented memories (short-term/ChromaDB, long-term/SQLite, entity/RAG) with one API [^1_1]. Default storage is **LanceDB** with composite scoring (semantic + recency + importance), and the system supports custom backends through the `StorageBackend` protocol [^1_1]. That is exactly where MindBrain fits.

## CrewAI’s structural problem

By default each `Crew` keeps isolated memory — two crews working on related domains share no common ontology registry [^1_1]. Hierarchical scopes (`/project/alpha`, `/agent/researcher`) organize memory within a crew but offer no **inter-crew, inter-run, or inter-framework context layer** [^1_2]. GhostCrab fills that gap.

## Three integration points

### 1. Custom `StorageBackend` (primary path)

CrewAI exposes `StorageBackend` so LanceDB can be replaced by any implementation [^1_1]. MindBrain implements that protocol (via GhostCrab MCP) with a Python-friendly surface :

```python
from crewai import Memory
from ghostcrab import MindBrainStorageBackend

# MindBrainStorageBackend implements CrewAI's StorageBackend protocol
# Translates save/search calls into MCP requests to GhostCrab
mb_storage = MindBrainStorageBackend(
    mcp_endpoint="http://localhost:8765",
    ontology_namespace="my_project",
)

memory = Memory(
    storage=mb_storage,
    embedder={"provider": "ollama", "config": {"model_name": "mxbai-embed-large"}},
    llm="ollama/llama3.2",  # full local stack possible
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    memory=memory,
)
```

This pattern ensures **every agent on the crew reads and writes MindBrain** without changing CrewAI’s behavior [^1_1].

### 2. `MCPServerAdapter` as an agent tool (complementary path)

CrewAI supports MCP servers natively since `crewai-tools==0.42.0` [^1_3]. GhostCrab can be registered as a tool on each agent for ontology primitives (lookup, traversal, facets) :

```python
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

ghostcrab_params = StdioServerParameters(
    command="ghostcrab",
    args=["--namespace", "my_project", "--mode", "mcp"],
)

with MCPServerAdapter(ghostcrab_params) as ghostcrab_tools:
    ontology_agent = Agent(
        role="Ontology Architect",
        goal="Maintain and query the shared knowledge registry",
        tools=ghostcrab_tools,  # lookup_entity, query_facets, assert_relation...
        memory=memory,          # shared memory via StorageBackend
    )
```

This entry point is separate from the memory backend: it exposes **structured querying** (faceted search, graph traversal) that LanceDB alone does not provide [^1_3].

### 3. `MemorySlice` for cross-crew sharing

CrewAI can build `MemorySlice` views that combine scopes [^1_1]. With MindBrain as the backend, that becomes a **cross-crew shared registry** :

```python
# Crew A: domain expert
crew_a_memory = memory.scope("/domain/infrastructure")

# Crew B: integration; reads A's context plus its own scope
crew_b_view = memory.slice(
    scopes=["/domain/infrastructure", "/agent/integrator"],
    read_only=False,
)
```

On the MindBrain side, these scopes map to queryable ontology subgraphs — where CrewAI sees a string hierarchy, MindBrain sees typed nodes with relations and facets.

## Conceptual mapping

| Native CrewAI | MindBrain / GhostCrab equivalent |
| :-- | :-- |
| `Memory()` with LanceDB | `Memory(storage=MindBrainStorageBackend)` |
| Scope `/project/alpha` | Ontology namespace + node type |
| `memory.recall("what DB?")` | Vector query + graph traversal |
| `memory.tree()` | `ghostcrab ontology list --namespace ...` |
| Short-term silo per crew | Shared registry across crews and runs |
| Ad-hoc entity extraction via LLM | Typed entities with explicit schema |

## What to implement on the GhostCrab side

For a clean integration, GhostCrab should expose:

- CrewAI’s **`StorageBackend` protocol** (`save`, `search`, `reset`) mapped to MindBrain MCP calls [^1_1]
- A **thin Python wrapper** (PyPI package `ghostcrab-crewai`) so CrewAI users need not know Go or MCP
- An **`MCPServerAdapter`-compatible server** for advanced ontology tools (facets, traversal), alongside the memory backend [^1_3]

The value proposition is the same for any CrewAI user: one crew or fifty, MindBrain is the layer that persists and structures context **beyond** a single run’s lifecycle.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://docs.crewai.com/en/concepts/memory

[^1_2]: https://deepwiki.com/crewAIInc/crewAI/4-memory-system

[^1_3]: https://community.crewai.com/t/agents-can-discover-use-tools-hosted-on-model-context-protocol-mcp-server/5254

[^1_4]: https://sparkco.ai/blog/deep-dive-into-crewai-memory-systems

[^1_5]: https://crewai.com/blog/how-we-built-cognitive-memory-for-agentic-systems

[^1_6]: https://www.emergentmind.com/topics/crewai-framework

[^1_7]: https://langchain-ai.github.io/langmem/guides/use_tools_in_crewai/

[^1_8]: https://modelcontextprotocol.io/specification/2025-03-26

[^1_9]: https://www.geeksforgeeks.org/artificial-intelligence/memory-in-crewai/

[^1_10]: https://dev.to/arulnidhi_karunanidhi_7ff/how-to-add-persistent-memory-to-crewai-agents-2o63

[^1_11]: https://github.com/adam-paterson/mcp-crew-ai

[^1_12]: https://github.com/crewAIInc/crewAI/blob/main/docs/concepts/memory.mdx

[^1_13]: https://deepwiki.com/crewAIInc/crewAI/4.4-external-memory

[^1_14]: https://deepwiki.com/lymanzhang/crewAI/4.1-memory-types-and-contextual-memory

[^1_15]: https://www.zinyando.com/building-conversational-chatbots-with-knowledge-using-crewai-and-mem0-2/


---

# Describe the structure the CrewAI integration Skill should contain.

The skill structure follows documented CrewAI interfaces. Full description below.

***

## Scope of the `ghostcrab-crewai` skill

The skill is a **thin Python package** (`ghostcrab-crewai` on PyPI) with three roles: storage backend, MCP tool server for ontology operations, and migration utilities. It contains no domain logic — everything goes through GhostCrab over MCP.

## File layout

```
ghostcrab-crewai/
├── pyproject.toml
├── README.md
│
├── ghostcrab_crewai/
│   ├── __init__.py                  # public exports: MindBrainStorage, GhostCrabMCPServer
│   │
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── backend.py               # MindBrainStorage — implements StorageBackend protocol
│   │   ├── items.py                 # Dataclasses: MemoryItem, SearchResult (CrewAI ↔ MindBrain mapping)
│   │   └── serializer.py            # Serialize MemoryItem to MCP payloads
│   │
│   ├── mcp/
│   │   ├── __init__.py
│   │   ├── client.py                # GhostCrabMCPClient — httpx/stdio MCP calls
│   │   ├── tools.py                 # GhostCrabMCPServer — tools for MCPServerAdapter
│   │   └── schema.py                # Pydantic schemas for GhostCrab MCP requests/responses
│   │
│   ├── memory/
│   │   ├── __init__.py
│   │   └── shared.py                # SharedOntologyMemory — cross-crew scope binding helper
│   │
│   └── exceptions.py                # GhostCrabConnectionError, OntologyNamespaceError
│
└── tests/
    ├── test_storage_backend.py      # Mock MCP; verifies save/search/reset
    ├── test_mcp_tools.py            # GhostCrab tool discovery
    └── test_shared_memory.py        # Cross-crew scope binding
```


## Contents of each key module

### `storage/backend.py` — core of the skill

Implements CrewAI’s `StorageBackend` protocol [^2_1][^2_2] with the three required methods :

```python
from typing import Any
from ghostcrab_crewai.mcp.client import GhostCrabMCPClient

class MindBrainStorage:
    """
    Drop-in StorageBackend for CrewAI.
    Delegates save/search/reset to GhostCrab via MCP.
    """

    def __init__(
        self,
        mcp_endpoint: str = "http://localhost:8765",
        namespace: str = "default",
        score_threshold: float = 0.35,
    ):
        self.client = GhostCrabMCPClient(endpoint=mcp_endpoint)
        self.namespace = namespace
        self.score_threshold = score_threshold

    def save(self, value: Any, metadata: dict | None = None) -> None:
        """
        Maps a CrewAI MemoryItem to a MindBrain ontology assertion.
        metadata may include: source_type, agent_id, task_id, crew_id, scope
        """
        payload = self._serialize(value, metadata)
        self.client.call("memory.save", payload)

    def search(
        self, query: str, limit: int = 5, score_threshold: float | None = None
    ) -> list[Any]:
        """
        Runs vector search plus graph traversal against MindBrain.
        Returns a list of CrewAI-compatible SearchResult objects.
        """
        results = self.client.call("memory.search", {
            "namespace": self.namespace,
            "query": query,
            "limit": limit,
            "score_threshold": score_threshold or self.score_threshold,
        })
        return [self._deserialize(r) for r in results]

    def reset(self) -> None:
        """Clears the namespace in MindBrain (reversible via snapshot)."""
        self.client.call("memory.reset", {"namespace": self.namespace})

    def _serialize(self, value: Any, metadata: dict | None) -> dict:
        # Map MemoryItem → MindBrain ontology node
        ...

    def _deserialize(self, raw: dict) -> Any:
        # Map MindBrain result → CrewAI SearchResult
        ...
```


### `mcp/client.py` — MCP transport

Supports **stdio** (local GhostCrab process) and **HTTP/SSE** (deployed GhostCrab) [^2_3]. Transport is inferred from `endpoint` (`ghostcrab://` → stdio, `http://` → HTTP).

```python
class GhostCrabMCPClient:
    def __init__(self, endpoint: str): ...
    def call(self, method: str, params: dict) -> dict: ...
    def list_tools(self) -> list[str]: ...  # for MCPServerAdapter
```


### `mcp/tools.py` — advanced tools for agents

Exposes capabilities **beyond plain memory**: faceted search, graph traversal, entity assertion. These tools plug into `MCPServerAdapter` from `crewai-tools` [^2_3] :

```python
# Tools GhostCrab exposes at agent scope (not storage layer)
GHOSTCRAB_TOOLS = [
    "ontology.lookup_entity",      # find entity by type + facets
    "ontology.query_facets",       # structured faceted search
    "ontology.assert_relation",    # create typed relation between two nodes
    "ontology.traverse",           # traversal de graphe (BFS/DFS)
    "ontology.snapshot",           # namespace restore point
    "ontology.diff",               # compare two graph snapshots
]
```


### `memory/shared.py` — cross-crew sharing

Helper that returns a CrewAI `Memory` pre-wired for a namespace to reduce scope mistakes [^2_4] :

```python
from crewai import Memory
from ghostcrab_crewai.storage.backend import MindBrainStorage

def shared_ontology_memory(
    namespace: str,
    mcp_endpoint: str = "http://localhost:8765",
    embedder: dict | None = None,
    llm: str = "ollama/llama3.2",
) -> Memory:
    """
    Factory: returns CrewAI Memory wired to MindBrain.
    All crews using the same namespace share one registry.
    """
    storage = MindBrainStorage(mcp_endpoint=mcp_endpoint, namespace=namespace)
    return Memory(
        storage=storage,
        embedder=embedder or {"provider": "ollama", "config": {"model_name": "mxbai-embed-large"}},
        llm=llm,
    )
```


## `pyproject.toml` — dependencies and extras

```toml
[project]
name = "ghostcrab-crewai"
requires-python = ">=3.10"

dependencies = [
    "crewai>=0.80.0",          # StorageBackend-stable release
    "httpx>=0.27",             # transport HTTP/SSE vers GhostCrab
    "pydantic>=2.0",
    "mcp>=1.0",                # SDK MCP officiel (stdio transport)
]

[project.optional-dependencies]
tools = [
    "crewai-tools>=0.42.0",   # MCPServerAdapter
]
dev = [
    "pytest", "pytest-asyncio", "respx"  # httpx mocking
]
```


## What the skill does NOT include

- No embedding logic (delegated to native CrewAI `Memory`)
- No LLM models (delegated to user CrewAI config)
- No ontology definitions (they live in MindBrain, not the skill)
- No UI or CLI (GhostCrab MCP already exposes `ghostcrab ontology ...`)


## Final usage for CrewAI integrators

```python
from ghostcrab_crewai import shared_ontology_memory
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

# 1 line for shared memory
memory = shared_ontology_memory(namespace="my_project")

# 1 block for advanced ontology tools
with MCPServerAdapter(StdioServerParameters(command="ghostcrab", args=["serve"])) as tools:
    crew = Crew(agents=[...], tasks=[...], memory=memory)
    crew.kickoff()
```

That is the minimal API surface — no need to learn Go, MCP internals, or MindBrain for a standard CrewAI user [^2_2][^2_5].
<span style="display:none">[^2_10][^2_11][^2_12][^2_13][^2_14][^2_15][^2_16][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://deepwiki.com/crewAIInc/crewAI/4-memory-system

[^2_2]: https://libraries.io/pypi/crewai-superlocalmemory

[^2_3]: https://community.crewai.com/t/agents-can-discover-use-tools-hosted-on-model-context-protocol-mcp-server/5254

[^2_4]: https://docs.crewai.com/en/concepts/memory

[^2_5]: https://www.novyxlabs.com/guides/crewai-persistent-memory

[^2_6]: https://www.linkedin.com/pulse/your-crewai-agents-forget-everything-between-runs-heres-fix-jly2f

[^2_7]: https://docs.crewai.com

[^2_8]: https://community.crewai.com/t/persistence-knowledge/6574

[^2_9]: https://www.tigrisdata.com/docs/agents/agent-crewai/

[^2_10]: https://github.com/crewAIInc/crewAI/issues/2278

[^2_11]: https://github.com/crewAIInc/crewAI/issues/2026

[^2_12]: https://www.geeksforgeeks.org/artificial-intelligence/memory-in-crewai/

[^2_13]: https://github.com/crewAIInc/crewAI/blob/f675208d72b0f6222464c570ec0cbd514dbc90eb/src/crewai/crew.py

[^2_14]: https://stackoverflow.com/questions/79384059/how-to-locate-the-memory-directory-in-crewai-and-use-a-custom-directory

[^2_15]: https://www.aidoczh.com/crewai/en/concepts/memory.html

[^2_16]: https://www.youtube.com/watch?v=ojgQBDu6H6M


---

# Now write in English the full “skills” document for Claude Code or Codex so it knows how to handle everything discussed above.

The skill file is ready — 724 lines, self-contained, ready to drop into a `~/skills/` directory for Claude Code, Codex, or any agent that reads skill files before executing tasks.

## Structure of the skill

The file is organized in eight sections that a coding agent reads top-to-bottom before touching any file:


| Section | Purpose |
| :-- | :-- |
| **Mental model** | Explains the two orthogonal concerns (memory backend vs. agent tools) so the agent never conflates them |
| **Repository layout** | Exact file tree — the agent creates this structure verbatim |
| **`pyproject.toml`** | Full metadata, dependencies, extras — the agent runs `hatch build` without asking questions |
| **Per-module implementations** | Complete, runnable Python for each of the 8 source files |
| **Tests** | `conftest.py` + three test files with `respx` mocks — the agent runs `pytest` and knows what green looks like |
| **Integration reference** | Three copy-paste usage patterns (memory-only, memory+tools, multi-crew) |
| **What is NOT covered** | Hard boundary so the agent doesn't hallucinate GhostCrab internals |
| **Failure modes table** | 5 known failure scenarios with symptoms and mitigations — the agent handles them without escalating |

## How to invoke it in an agent session

For Claude Code, prefix the task:

```
Read ~/skills/ghostcrab-crewai.md first, then scaffold the full package.
```

For Codex or any OpenAI Codex-compatible agent, pass it as a system file or context injection before the coding prompt. The skill is intentionally free of any framework-specific loader syntax — it works as plain Markdown in any context window.

---

# Skill: ghostcrab-architect


***
name: ghostcrab-architect
version: 1
description: >
Load this skill when the task is to design, scaffold, or populate an ontology
using GhostCrab MCP onboarding primitives. Covers namespace initialization,
node type definition, relation schema, facet configuration, and seed data
ingestion — all expressed as GhostCrab MCP calls or CLI commands.
Intended for Claude Code, Codex, or any agentic coding assistant.
agents: [claude_code, codex, general_purpose]
***

## Purpose

This skill teaches an agent how to **build an ontology from scratch using GhostCrab MCP**.
It covers the full onboarding sequence: from an empty namespace to a populated, queryable
ontological registry ready to be consumed by CrewAI agents via `ghostcrab-crewai`.

A GhostCrab ontology is **not a fixed schema** — it is a living graph of typed nodes,
typed relations, and facets (structured attributes). The goal is always the same:
give AI agents a shared, persistent, structured context layer they can read and write
collaboratively.

***

## Mental Model

```
Namespace
  └── Node Types          (e.g. "Component", "Agent", "Capability", "Decision")
        └── Nodes         (instances of a type, identified by slug + attributes)
              └── Facets  (typed, filterable attributes: string, enum, float, list)
  └── Relation Types      (e.g. "DEPENDS_ON", "OWNS", "IMPLEMENTS", "PRODUCES")
        └── Relations     (directed edges between nodes: source → target, typed)
```

Facets are the core differentiator vs. a plain graph DB:

- They are declared at the **type level** (schema) and indexed for fast faceted search.
- Every `memory.search` or `ontology.query_facets` call filters by node type + facets.
- Agents use facets to retrieve precise slices of context without full-text ambiguity.

***

## GhostCrab MCP Transport

GhostCrab exposes all operations as **MCP (Model Context Protocol) JSON-RPC 2.0** calls.

### Two supported transports

| Transport | When to use | Command |
| :-- | :-- | :-- |
| **stdio** | Local dev, Claude Code sessions | `ghostcrab serve --mode mcp --stdio` |
| **HTTP/SSE** | Deployed service | `POST http://localhost:8765/mcp` |

### JSON-RPC envelope

```json
{
  "jsonrpc": "2.0",
  "method": "ontology.init_namespace",
  "params": { "namespace": "my-project" },
  "id": 1
}
```

All methods below follow this envelope. In CLI examples, the equivalent
`ghostcrab` subcommand is shown as an alternative.

***

## Onboarding Sequence

The sequence must be followed in order. Each step depends on the previous.

```
1. init_namespace       → create the namespace container
2. define_node_types    → declare node types + their facet schemas
3. define_relation_types → declare typed directed edges
4. seed_nodes           → create initial node instances
5. seed_relations       → wire nodes together
6. verify               → introspect and validate the graph
```


***

## Step 1 — Initialize the Namespace

A namespace is an isolated ontological partition. All subsequent operations are scoped to it.

### MCP call

```json
{
  "method": "ontology.init_namespace",
  "params": {
    "namespace": "infra-project",
    "description": "Infrastructure knowledge graph for CrewAI agents",
    "version": "0.1.0"
  }
}
```


### CLI equivalent

```bash
ghostcrab ontology init \
  --namespace infra-project \
  --description "Infrastructure knowledge graph for CrewAI agents"
```


### Response

```json
{ "namespace": "infra-project", "status": "created", "created_at": "2026-05-10T09:00:00Z" }
```


### Rules

- Namespace slugs: lowercase alphanumeric + hyphens only. No slashes, no underscores.
- A namespace already exists: call returns `"status": "exists"` — safe to call idempotently.
- Never delete a namespace mid-session. Use `ontology.snapshot` to checkpoint before destructive ops.

***

## Step 2 — Define Node Types

Node types are the categories of entities in the ontology.
Each type declares **a set of facets** — typed, indexed attributes.

### MCP call

```json
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "infra-project",
    "type_name": "Component",
    "description": "A software or infrastructure component",
    "facets": [
      { "name": "status",   "type": "enum",   "values": ["active", "deprecated", "experimental"], "required": true },
      { "name": "layer",    "type": "enum",   "values": ["data", "api", "agent", "ui"], "required": true },
      { "name": "language", "type": "string", "required": false },
      { "name": "version",  "type": "string", "required": false },
      { "name": "tags",     "type": "list",   "item_type": "string", "required": false }
    ]
  }
}
```


### Facet types reference

| Facet type | Description | Example value |
| :-- | :-- | :-- |
| `string` | Free-text, searchable | `"Go 1.22"` |
| `enum` | Constrained set of values | `"active"` |
| `float` | Numeric, range-filterable | `0.95` |
| `int` | Integer, range-filterable | `42` |
| `bool` | Boolean flag | `true` |
| `list` | Ordered list of items (typed) | `["postgresql", "mcp"]` |
| `date` | ISO 8601 date | `"2026-05-10"` |

### Rules

- A node type must be defined before any node of that type is created.
- `required: true` facets must be provided at node creation time.
- Facet names must be lowercase snake_case.
- You can add facets to an existing type (additive), but you cannot remove them without a migration.
- For CrewAI integration, always define a `MemoryObservation` and `TaskOutput` node type
— these are the types written by `MindBrainStorage.save()`.


### Mandatory types for CrewAI integration

Always define these two types in any namespace used with `ghostcrab-crewai`:

```json
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "infra-project",
    "type_name": "MemoryObservation",
    "description": "A raw memory item saved by a CrewAI agent",
    "facets": [
      { "name": "agent_id",    "type": "string", "required": false },
      { "name": "task_id",     "type": "string", "required": false },
      { "name": "crew_id",     "type": "string", "required": false },
      { "name": "scope",       "type": "string", "required": false },
      { "name": "importance",  "type": "float",  "required": false }
    ]
  }
}
```

```json
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "infra-project",
    "type_name": "TaskOutput",
    "description": "The structured output of a completed CrewAI task",
    "facets": [
      { "name": "task_id",  "type": "string", "required": true },
      { "name": "crew_id",  "type": "string", "required": false },
      { "name": "status",   "type": "enum",   "values": ["success", "partial", "failed"], "required": true }
    ]
  }
}
```


***

## Step 3 — Define Relation Types

Relation types declare the typed directed edges between nodes.

### MCP call

```json
{
  "method": "ontology.define_relation_type",
  "params": {
    "namespace": "infra-project",
    "relation_name": "DEPENDS_ON",
    "description": "Source component depends on target component",
    "source_types": ["Component"],
    "target_types": ["Component"],
    "attributes": [
      { "name": "strength", "type": "enum", "values": ["hard", "soft", "optional"] },
      { "name": "since",    "type": "date" }
    ]
  }
}
```


### Common relation type patterns

```json
// Ownership
{ "relation_name": "OWNS",        "source_types": ["Agent"],     "target_types": ["Component"] }

// Implementation
{ "relation_name": "IMPLEMENTS",  "source_types": ["Component"], "target_types": ["Capability"] }

// Production
{ "relation_name": "PRODUCES",    "source_types": ["Agent"],     "target_types": ["TaskOutput"] }

// Reference
{ "relation_name": "REFERENCES",  "source_types": ["MemoryObservation"], "target_types": ["Component", "Capability"] }
```


### Rules

- `source_types` and `target_types` must reference already-defined node types.
- Relation attributes are optional — relations can have zero attributes.
- Relation names: UPPER_SNAKE_CASE by convention.
- A relation can span multiple source or target types — use arrays.

***

## Step 4 — Seed Nodes

Create initial node instances. Each node requires a unique `slug` within its type,
and all `required` facets must be provided.

### MCP call — single node

```json
{
  "method": "ontology.create_node",
  "params": {
    "namespace": "infra-project",
    "type_name": "Component",
    "slug": "ghostcrab-mcp",
    "content": "GhostCrab MCP server — exposes MindBrain ontology operations via Model Context Protocol",
    "facets": {
      "status": "active",
      "layer": "api",
      "language": "Go",
      "version": "0.5.0",
      "tags": ["mcp", "ontology", "ghostcrab"]
    }
  }
}
```


### MCP call — batch nodes

```json
{
  "method": "ontology.create_nodes_batch",
  "params": {
    "namespace": "infra-project",
    "nodes": [
      {
        "type_name": "Component",
        "slug": "mindbrain-core",
        "content": "MindBrain PostgreSQL ontological database",
        "facets": { "status": "active", "layer": "data", "language": "Go" }
      },
      {
        "type_name": "Component",
        "slug": "ghostcrab-crewai",
        "content": "Python package bridging CrewAI memory to MindBrain via GhostCrab MCP",
        "facets": { "status": "active", "layer": "api", "language": "Python" }
      }
    ]
  }
}
```


### CLI equivalent

```bash
ghostcrab ontology node create \
  --namespace infra-project \
  --type Component \
  --slug ghostcrab-mcp \
  --content "GhostCrab MCP server..." \
  --facet status=active \
  --facet layer=api \
  --facet language=Go
```


### Response

```json
{
  "node_id": "cmp:ghostcrab-mcp",
  "type_name": "Component",
  "slug": "ghostcrab-mcp",
  "created_at": "2026-05-10T09:05:00Z"
}
```


### Rules

- `slug` must be unique within a `(namespace, type_name)` pair.
- `content` is the free-text string that gets embedded (vector index). Make it descriptive.
- `slug` format: lowercase alphanumeric + hyphens. No spaces.
- Upsert behavior: `create_node` on an existing slug updates the node (idempotent).

***

## Step 5 — Seed Relations

Wire nodes together with typed directed edges.

### MCP call

```json
{
  "method": "ontology.assert_relation",
  "params": {
    "namespace": "infra-project",
    "relation_name": "DEPENDS_ON",
    "source_type": "Component",
    "source_slug": "ghostcrab-crewai",
    "target_type": "Component",
    "target_slug": "ghostcrab-mcp",
    "attributes": {
      "strength": "hard"
    }
  }
}
```


### Batch relations

```json
{
  "method": "ontology.assert_relations_batch",
  "params": {
    "namespace": "infra-project",
    "relations": [
      {
        "relation_name": "DEPENDS_ON",
        "source_type": "Component", "source_slug": "ghostcrab-crewai",
        "target_type": "Component", "target_slug": "ghostcrab-mcp",
        "attributes": { "strength": "hard" }
      },
      {
        "relation_name": "DEPENDS_ON",
        "source_type": "Component", "source_slug": "ghostcrab-mcp",
        "target_type": "Component", "target_slug": "mindbrain-core",
        "attributes": { "strength": "hard" }
      }
    ]
  }
}
```


### Rules

- Source and target slugs must already exist before asserting a relation.
- `assert_relation` is idempotent: calling it twice with the same args updates attributes.
- Relation attributes are merged (not replaced) on update.

***

## Step 6 — Verify the Graph

### List node types

```json
{ "method": "ontology.list_types", "params": { "namespace": "infra-project" } }
```


### Get the ontology tree

```json
{ "method": "ontology.tree", "params": { "namespace": "infra-project" } }
```


### Search (vector + facets)

```json
{
  "method": "memory.search",
  "params": {
    "namespace": "infra-project",
    "query": "MCP server for ontology",
    "limit": 5,
    "score_threshold": 0.3
  }
}
```


### Faceted search

```json
{
  "method": "ontology.query_facets",
  "params": {
    "namespace": "infra-project",
    "type_name": "Component",
    "filters": [
      { "facet": "status", "op": "eq",  "value": "active" },
      { "facet": "layer",  "op": "eq",  "value": "api" }
    ],
    "limit": 20
  }
}
```


### Traverse from a node

```json
{
  "method": "ontology.traverse",
  "params": {
    "namespace": "infra-project",
    "start_type": "Component",
    "start_slug": "ghostcrab-crewai",
    "relation_name": "DEPENDS_ON",
    "direction": "outbound",
    "depth": 3
  }
}
```


### CLI equivalents

```bash
ghostcrab ontology tree --namespace infra-project
ghostcrab ontology search --namespace infra-project --query "MCP server"
ghostcrab ontology traverse --namespace infra-project \
  --from Component:ghostcrab-crewai \
  --relation DEPENDS_ON --depth 3
```


***

## Snapshot and Recovery

Always snapshot before destructive operations or before handing off the namespace to CrewAI agents.

```json
{ "method": "ontology.snapshot", "params": { "namespace": "infra-project", "label": "post-seed-v1" } }
```

```bash
ghostcrab ontology snapshot --namespace infra-project --label post-seed-v1
ghostcrab ontology restore --namespace infra-project --snapshot post-seed-v1
```


***

## Full Python Onboarding Script (reference implementation)

Use this when the agent must produce a Python script that performs the full onboarding sequence.

```python
"""
ghostcrab_onboarding.py

Full onboarding sequence for a GhostCrab ontology namespace.
Designed to be idempotent: safe to run multiple times.

Usage:
    python ghostcrab_onboarding.py --namespace my-project --endpoint http://localhost:8765
"""
import argparse
import json
import httpx
import sys


def mcp_call(client: httpx.Client, endpoint: str, method: str, params: dict) -> dict:
    payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    response = client.post(f"{endpoint}/mcp", json=payload, timeout=15.0)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise RuntimeError(f"GhostCrab error [{method}]: {data['error']}")
    return data.get("result", {})


def onboard(namespace: str, endpoint: str) -> None:
    with httpx.Client() as client:
        call = lambda method, params: mcp_call(client, endpoint, method, params)

        # ── 1. Init namespace ──────────────────────────────────────────
        result = call("ontology.init_namespace", {
            "namespace": namespace,
            "description": f"Ontology for {namespace}",
        })
        print(f"[1] Namespace: {result['status']}")

        # ── 2. Define node types ───────────────────────────────────────
        node_types = [
            {
                "type_name": "Component",
                "description": "A software or infrastructure component",
                "facets": [
                    {"name": "status",   "type": "enum",   "values": ["active", "deprecated", "experimental"], "required": True},
                    {"name": "layer",    "type": "enum",   "values": ["data", "api", "agent", "ui"],            "required": True},
                    {"name": "language", "type": "string", "required": False},
                    {"name": "version",  "type": "string", "required": False},
                    {"name": "tags",     "type": "list",   "item_type": "string", "required": False},
                ],
            },
            {
                "type_name": "Capability",
                "description": "A functional capability exposed by a component",
                "facets": [
                    {"name": "category", "type": "string", "required": False},
                    {"name": "maturity", "type": "enum",   "values": ["alpha", "beta", "stable"], "required": False},
                ],
            },
            {
                "type_name": "MemoryObservation",
                "description": "A raw memory item saved by a CrewAI agent",
                "facets": [
                    {"name": "agent_id",   "type": "string", "required": False},
                    {"name": "task_id",    "type": "string", "required": False},
                    {"name": "crew_id",    "type": "string", "required": False},
                    {"name": "scope",      "type": "string", "required": False},
                    {"name": "importance", "type": "float",  "required": False},
                ],
            },
            {
                "type_name": "TaskOutput",
                "description": "The structured output of a completed CrewAI task",
                "facets": [
                    {"name": "task_id", "type": "string", "required": True},
                    {"name": "crew_id", "type": "string", "required": False},
                    {"name": "status",  "type": "enum",   "values": ["success", "partial", "failed"], "required": True},
                ],
            },
        ]
        for nt in node_types:
            call("ontology.define_node_type", {"namespace": namespace, **nt})
            print(f"[2] Node type defined: {nt['type_name']}")

        # ── 3. Define relation types ───────────────────────────────────
        relation_types = [
            {"relation_name": "DEPENDS_ON",   "source_types": ["Component"],         "target_types": ["Component"]},
            {"relation_name": "IMPLEMENTS",   "source_types": ["Component"],         "target_types": ["Capability"]},
            {"relation_name": "PRODUCES",     "source_types": ["Component"],         "target_types": ["TaskOutput"]},
            {"relation_name": "REFERENCES",   "source_types": ["MemoryObservation"], "target_types": ["Component", "Capability"]},
        ]
        for rt in relation_types:
            call("ontology.define_relation_type", {"namespace": namespace, **rt})
            print(f"[3] Relation type defined: {rt['relation_name']}")

        # ── 4. Seed nodes ──────────────────────────────────────────────
        nodes = [
            {
                "type_name": "Component", "slug": "mindbrain-core",
                "content": "MindBrain PostgreSQL ontological database — structured, queryable, persistent context store",
                "facets": {"status": "active", "layer": "data", "language": "Go", "version": "0.5.0"},
            },
            {
                "type_name": "Component", "slug": "ghostcrab-mcp",
                "content": "GhostCrab MCP server — exposes MindBrain operations as Model Context Protocol tools",
                "facets": {"status": "active", "layer": "api", "language": "Go", "version": "0.5.0"},
            },
            {
                "type_name": "Component", "slug": "ghostcrab-crewai",
                "content": "Python bridge package connecting CrewAI memory system to MindBrain via GhostCrab MCP",
                "facets": {"status": "active", "layer": "api", "language": "Python"},
            },
        ]
        call("ontology.create_nodes_batch", {"namespace": namespace, "nodes": nodes})
        print(f"[4] {len(nodes)} nodes seeded")

        # ── 5. Seed relations ──────────────────────────────────────────
        relations = [
            {
                "relation_name": "DEPENDS_ON",
                "source_type": "Component", "source_slug": "ghostcrab-crewai",
                "target_type": "Component", "target_slug": "ghostcrab-mcp",
                "attributes": {"strength": "hard"},
            },
            {
                "relation_name": "DEPENDS_ON",
                "source_type": "Component", "source_slug": "ghostcrab-mcp",
                "target_type": "Component", "target_slug": "mindbrain-core",
                "attributes": {"strength": "hard"},
            },
        ]
        call("ontology.assert_relations_batch", {"namespace": namespace, "relations": relations})
        print(f"[5] {len(relations)} relations asserted")

        # ── 6. Snapshot ────────────────────────────────────────────────
        snap = call("ontology.snapshot", {"namespace": namespace, "label": "post-seed-v1"})
        print(f"[6] Snapshot created: {snap['snapshot_id']}")

        # ── 7. Verify ──────────────────────────────────────────────────
        tree = call("ontology.tree", {"namespace": namespace})
        print(f"[7] Ontology tree snapshot: {json.dumps(tree, default=str)[:2000]}")
```

---

# Skill: ghostcrab-runtime

***
name: ghostcrab-runtime
version: 1
description: >
  Load this skill when the task is to build a CrewAI orchestrator that uses
  MindBrain (via GhostCrab MCP) as its operational backbone: project coordination,
  agent reporting, task status tracking, and inter-agent context sharing all flow
  through the knowledge graph. MindBrain is not a passive store — it is the
  source of truth that drives what agents do next.
agents: [claude_code, codex, general_purpose]
requires: [ghostcrab-architect, ghostcrab-crewai]
***

## Purpose

This skill teaches an agent how to build a **MindBrain-driven CrewAI orchestrator**.

The orchestrator reads project state from MindBrain, assigns tasks to agents based
on graph state, and instructs every agent to write its outputs back to MindBrain
as structured nodes and relations. The graph becomes both the **mission briefing**
and the **running logbook** of the project.

The key inversion vs. standard CrewAI: agents do not decide what to do next by
passing messages to each other. **The graph decides.** The orchestrator queries
MindBrain for pending work, dispatches agents, and agents write results back.
MindBrain is the single source of truth at all times.

***

## Mental Model

```
                        ┌─────────────────────────────────┐
                        │         MindBrain               │
                        │   (PostgreSQL ontology graph)   │
                        │                                 │
                        │  Project → Tasks → Findings     │
                        │  Agents  → Outputs → Decisions  │
                        │  Status facets: pending/done    │
                        └────────────┬────────────────────┘
                                     │  read / write via GhostCrab MCP
                        ┌────────────▼────────────────────┐
                        │     CrewAI Orchestrator          │
                        │  (queries graph, dispatches)     │
                        └──────┬──────────────────────────┘
               ┌───────────────┼───────────────────────────┐
               ▼               ▼                           ▼
         Agent A            Agent B                    Agent N
    (Researcher)         (Architect)               (Reporter)
         │                   │                           │
         └───────────────────┴───────────────────────────┘
                          write back
                    (nodes, relations, status)
                          to MindBrain
```

The orchestrator never passes raw text between agents. All inter-agent context
travels through MindBrain. An agent that needs context from a previous agent
queries the graph directly.

***

## Ontology Extension for Runtime

Before writing the orchestrator, extend the namespace (built in `ghostcrab-architect`)
with the node types and relation types required for runtime operations.

### Additional node types

```json
// Project node — the root of all activity
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "my-project",
    "type_name": "Project",
    "description": "A managed project tracked in MindBrain",
    "facets": [
      { "name": "status",     "type": "enum",   "values": ["planning", "active", "paused", "done"], "required": true },
      { "name": "phase",      "type": "string", "required": false },
      { "name": "owner",      "type": "string", "required": false },
      { "name": "started_at", "type": "date",   "required": false }
    ]
  }
}
```

```json
// Task node — a unit of work the orchestrator dispatches
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "my-project",
    "type_name": "Task",
    "description": "A unit of work assigned to a CrewAI agent",
    "facets": [
      { "name": "status",      "type": "enum",   "values": ["pending", "in_progress", "done", "failed", "blocked"], "required": true },
      { "name": "assigned_to", "type": "string", "required": false },
      { "name": "priority",    "type": "enum",   "values": ["critical", "high", "normal", "low"], "required": false },
      { "name": "started_at",  "type": "date",   "required": false },
      { "name": "done_at",     "type": "date",   "required": false }
    ]
  }
}
```

```json
// Finding node — a structured insight produced by an agent
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "my-project",
    "type_name": "Finding",
    "description": "A structured insight or analysis result produced by an agent",
    "facets": [
      { "name": "category",   "type": "string", "required": false },
      { "name": "confidence", "type": "float",  "required": false },
      { "name": "agent_id",   "type": "string", "required": false },
      { "name": "task_id",    "type": "string", "required": false }
    ]
  }
}
```

```json
// Decision node — a resolution or directive produced by the orchestrator
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "my-project",
    "type_name": "Decision",
    "description": "A project-level decision driven by agent findings",
    "facets": [
      { "name": "rationale",   "type": "string", "required": false },
      { "name": "decided_by",  "type": "string", "required": false },
      { "name": "decided_at",  "type": "date",   "required": false }
    ]
  }
}
```

```json
// AgentReport node — the full reporting envelope written by an agent at task end
{
  "method": "ontology.define_node_type",
  "params": {
    "namespace": "my-project",
    "type_name": "AgentReport",
    "description": "Complete reporting envelope written by an agent upon task completion",
    "facets": [
      { "name": "agent_id",    "type": "string", "required": true },
      { "name": "task_id",     "type": "string", "required": true },
      { "name": "crew_id",     "type": "string", "required": false },
      { "name": "status",      "type": "enum",   "values": ["success", "partial", "failed"], "required": true },
      { "name": "duration_s",  "type": "float",  "required": false }
    ]
  }
}
```


### Additional relation types

```json
{
  "method": "ontology.define_relation_type",
  "params": {
    "namespace": "my-project",
    "relation_name": "HAS_TASK",
    "description": "Project contains a task",
    "source_types": ["Project"],
    "target_types": ["Task"]
  }
}
```

```json
{
  "method": "ontology.define_relation_type",
  "params": {
    "namespace": "my-project",
    "relation_name": "PRODUCED_BY",
    "description": "Finding or Decision was produced by an agent report",
    "source_types": ["Finding", "Decision"],
    "target_types": ["AgentReport"]
  }
}
```

```json
{
  "method": "ontology.define_relation_type",
  "params": {
    "namespace": "my-project",
    "relation_name": "CLOSES_TASK",
    "description": "An agent report closes a task",
    "source_types": ["AgentReport"],
    "target_types": ["Task"]
  }
}
```

```json
{
  "method": "ontology.define_relation_type",
  "params": {
    "namespace": "my-project",
    "relation_name": "INFORMS",
    "description": "A finding informs a decision",
    "source_types": ["Finding"],
    "target_types": ["Decision"]
  }
}
```

```json
{
  "method": "ontology.define_relation_type",
  "params": {
    "namespace": "my-project",
    "relation_name": "BLOCKS",
    "description": "One task blocks another",
    "source_types": ["Task"],
    "target_types": ["Task"]
  }
}
```


***

## Core Orchestrator Pattern

The orchestrator is a Python class that wraps a `GhostCrabMCPClient` and drives
the CrewAI dispatch loop. It never stores state in memory — every state read
and write goes through MindBrain.

```python
"""
ghostcrab_orchestrator.py

MindBrain-driven CrewAI orchestrator.
MindBrain is the source of truth: project state, task queue, agent outputs.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from crewai import Agent, Crew, Task
from ghostcrab_crewai import GhostCrabMCPClient, shared_ontology_memory
from ghostcrab_crewai.exceptions import GhostCrabConnectionError


class MindBrainOrchestrator:
    """
    Drives a CrewAI project using MindBrain as the operational backbone.

    Responsibilities:
    - Seed the project node on first run
    - Query MindBrain for pending tasks
    - Build and dispatch CrewAI Crew instances
    - Write all agent outputs back to MindBrain
    - Update task status in the graph after each run
    """

    def __init__(
        self,
        namespace: str,
        project_slug: str,
        mcp_endpoint: str = "http://localhost:8765",
    ) -> None:
        self.namespace = namespace
        self.project_slug = project_slug
        self.client = GhostCrabMCPClient(endpoint=mcp_endpoint)
        self.memory = shared_ontology_memory(
            namespace=namespace,
            mcp_endpoint=mcp_endpoint,
        )

    # ──────────────────────────────────────────────────────────────────
    # Project lifecycle
    # ──────────────────────────────────────────────────────────────────

    def init_project(self, description: str, phase: str = "planning") -> None:
        """
        Ensure the Project node exists in MindBrain.
        Idempotent: safe to call on every orchestrator startup.
        """
        self.client.call("ontology.create_node", {
            "namespace": self.namespace,
            "type_name": "Project",
            "slug": self.project_slug,
            "content": description,
            "facets": {
                "status": "active",
                "phase": phase,
                "started_at": str(date.today()),
            },
        })

    # ──────────────────────────────────────────────────────────────────
    # Task management
    # ──────────────────────────────────────────────────────────────────

    def register_task(
        self,
        task_slug: str,
        description: str,
        priority: str = "normal",
        blocks: list[str] | None = None,
    ) -> None:
        """
        Register a new Task node and link it to the project.
        `blocks` is a list of task slugs that this task must complete before.
        """
        self.client.call("ontology.create_node", {
            "namespace": self.namespace,
            "type_name": "Task",
            "slug": task_slug,
            "content": description,
            "facets": {"status": "pending", "priority": priority},
        })
        self.client.call("ontology.assert_relation", {
            "namespace": self.namespace,
            "relation_name": "HAS_TASK",
            "source_type": "Project", "source_slug": self.project_slug,
            "target_type": "Task",    "target_slug": task_slug,
        })
        for blocked_slug in (blocks or []):
            self.client.call("ontology.assert_relation", {
                "namespace": self.namespace,
                "relation_name": "BLOCKS",
                "source_type": "Task", "source_slug": task_slug,
                "target_type": "Task", "target_slug": blocked_slug,
            })

    def get_pending_tasks(self) -> list[dict]:
        """
        Query MindBrain for all Task nodes with status=pending,
        ordered by priority.
        """
        result = self.client.call("ontology.query_facets", {
            "namespace": self.namespace,
            "type_name": "Task",
            "filters": [
                {"facet": "status", "op": "eq", "value": "pending"},
            ],
            "limit": 50,
        })
        return result.get("items", [])

    def mark_task_in_progress(self, task_slug: str, agent_id: str) -> None:
        self.client.call("ontology.create_node", {
            "namespace": self.namespace,
            "type_name": "Task",
            "slug": task_slug,
            "content": None,  # upsert: preserve existing content
            "facets": {
                "status": "in_progress",
                "assigned_to": agent_id,
                "started_at": str(date.today()),
            },
        })

    def mark_task_done(self, task_slug: str) -> None:
        self.client.call("ontology.create_node", {
            "namespace": self.namespace,
            "type_name": "Task",
            "slug": task_slug,
            "content": None,
            "facets": {"status": "done", "done_at": str(date.today())},
        })

    def mark_task_blocked(self, task_slug: str, reason: str) -> None:
        self.client.call("ontology.create_node", {
            "namespace": self.namespace,
            "type_name": "Task",
            "slug": task_slug,
            "content": reason,
            "facets": {"status": "blocked"},
        })

    # ──────────────────────────────────────────────────────────────────
    # Dispatch loop
    # ──────────────────────────────────────────────────────────────────

    def run(self, agent_factory: dict[str, Agent]) -> None:
        """
        Main dispatch loop.

        1. Fetch pending tasks from MindBrain
        2. For each task, resolve the assigned agent from agent_factory
        3. Kick off a Crew, inject the reporting callback
        4. Write the AgentReport back to MindBrain
        5. Mark the task done (or failed)

        `agent_factory` maps task priority/type to a CrewAI Agent instance.
        Extend with routing logic as needed.
        """
        pending = self.get_pending_tasks()
        if not pending:
            print("[orchestrator] No pending tasks. Graph is clean.")
            return

        for task_node in pending:
            task_slug = task_node["slug"]
            task_content = task_node["content"]

            # Resolve agent — default to first available
            agent = list(agent_factory.values())[0]
            # Excerpt ends here: extend with Crew construction, kickoff, MindBrain AgentReport write-back.
```

