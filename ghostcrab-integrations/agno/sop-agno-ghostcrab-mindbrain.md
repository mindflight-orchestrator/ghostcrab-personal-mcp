# Integrating mindBrain with Agno

## About Agno

[Agno](https://github.com/agno-agi/agno) is an open-source Python framework for building, running, and managing agent platforms. It supports agents, teams, workflows, memory, knowledge, tools, and AgentOS runtime surfaces, which makes it a practical base for multi-agent applications that need both local development ergonomics and deployable agent infrastructure. Agno was formerly known as Phidata, so some existing projects and references still use that name.

## MindBrain

MindBrain is a structured agentic database that makes any domain navigable in real time — its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time.

## Why integrate mindBrain with Agno

Agno already gives developers clean Python primitives for agents, teams, memory, tools, and runtime APIs. mindBrain adds a shared, typed memory substrate behind those primitives, so separate Agno agents can coordinate around durable project facts, entity relationships, task state, and recovery context instead of leaving knowledge scattered across session storage or per-agent memory tables.

The lightest integration path is MCPTools: Agno agents can call GhostCrab tools without changing the framework core. Deeper integrations can map Agno memory events into mindBrain so the same ontology-backed state is available to Codex, Claude Code, and other MCP-capable agent environments.

## SKILLS available in this repo

- [`skill_ghostcrab_agno.md`](skill_ghostcrab_agno.md) helps an Agno agent, Codex, or Claude Code bootstrap and populate a MindBrain ontology through GhostCrab MCP.
- [`skill_ghostcrab_personal_agno.md`](skill_ghostcrab_personal_agno.md) gives Agno developers a first-contact GhostCrab Personal demo with local SQLite-backed shared memory.
- [`skill_ghostcrab_personal_agno_runtime.md`](skill_ghostcrab_personal_agno_runtime.md) describes practical runtime patterns for Agno teams, including task state, dependency graphs, recovery packs, and orchestrator heartbeats.

## Agno memory architecture: silos to replace

Agno handles memory through three distinct mechanisms, all siloed [^1_1] :

- **Session Storage**: chat history per session in a dedicated SQL table
- **User Memories**: facts extracted from conversations in another table (`agno_memories`)
- **Session Summaries**: condensed summaries in the same memory store

Each `Agent` wires its own backends via `storage=` and `memory=` [^1_2]. On a multi-agent team, each agent runs its own database with no shared registry. That is the main friction MindBrain addresses.

## Two integration entry points in Agno

### 1. Via MCPTools (preferred path)

Agno supports MCP natively through `MCPTools` with `streamable-http` or `stdio` transport [^1_3]. GhostCrab MCP plugs in directly as a tool :

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools

agent = Agent(
    name="ResearchAgent",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[
        MCPTools(
            transport="streamable-http",
            url="http://localhost:8080/mcp"  # GhostCrab MCP endpoint
        )
    ],
    # Disable local memory to avoid duplication
    enable_user_memories=False,
)
```

Outcome: the agent gets tools such as `ontology_query`, `entity_resolve`, `context_push`, etc. from GhostCrab. It can read and write the MindBrain ontology registry without modifying the framework.

### 2. Via a custom `MemoryDb` backend (deep integration)

Agno exposes a pluggable `MemoryDb` interface [^1_4][^1_5]. Implementing it lets MindBrain replace the native memory backend while staying transparent to existing Agno code :

```python
from agno.memory.v2.db.base import MemoryDb
from agno.memory.v2.memory import Memory
from agno.memory.v2.schema import UserMemory

class MindBrainMemoryDb(MemoryDb):
    def __init__(self, mindbrain_dsn: str, namespace: str):
        self.namespace = namespace
        # connexion via pg_dgraph / pg_facets

    def upsert_memory(self, memory: UserMemory) -> UserMemory:
        # Ontology graph push
        ...

    def search_memories(self, query: str, user_id: str) -> list[UserMemory]:
        # Faceted MindBrain query → returns structured entities
        ...

# Usage
memory = Memory(
    model=Claude(id="claude-haiku-3-5"),
    db=MindBrainMemoryDb(
        mindbrain_dsn="postgresql://...",
        namespace="team_alpha"
    )
)

agent = Agent(
    model=Claude(id="claude-sonnet-4-5"),
    memory=memory,
    enable_user_memories=True,
    storage=PostgresStorage(...)  # peut aussi pointer MindBrain
)
```


## Key talking point for Agno users

| Agno scenario | Problem | What MindBrain adds |
| :-- | :-- | :-- |
| Team of five agents, each with its own `SqliteMemoryDb` | No agent sees other agents’ facts | Shared namespace; all entities co-visible |
| Agent A learns `client_X = enterprise` | Only Agent A knows | MindBrain propagates the relationship via the graph |
| `agno_memories` stores unstructured strings | No typing, no semantic query | `pg_facets` + `pg_dgraph`: typed entities, named relations, queryable facets |
| Recovery after crash → session lost | Memory tied to session, not domain | Ontology persistence decoupled from agent lifecycle |

## Recommended integration order

1. **Phase 1 — MCPTools**: zero friction; expose GhostCrab as MCP; Agno agents use it like any tool. Fastest demo and adoption path.
2. **Phase 2 — Custom MemoryDb**: for teams that want native Agno memory (automatic fact extraction after each run) to write straight into MindBrain without an explicit tool call.
3. **Phase 3 — AgentOS**: Agno exposes AgentOS as an MCP server [^1_6] — MindBrain can also be consumed from Agno’s AgentOS for more complex orchestration topologies.

The MCPTools entry point is enough for a working POC in under a day, since Agno states that MCP support lets agents “securely connect to live data sources and trigger workflows with minimal configuration” [^1_7].
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://deepwiki.com/agno-agi/agno-docs/3.1.2-memory-and-storage

[^1_2]: https://docs.agno.com/memory/storage

[^1_3]: https://github.com/agno-agi/agno

[^1_4]: https://docs.agno.com/memory/overview

[^1_5]: https://deepwiki.com/agno-agi/agno/2.3-memory-system

[^1_6]: https://docs.agno.com/agent-os/mcp/mcp

[^1_7]: https://www.agno.com/agent-framework

[^1_8]: https://theses.hal.science/tel-00649427/file/ThA_se_B.HouzA_.pdf

[^1_9]: https://www.scribd.com/document/667551426/Cognitive-Conative-and-Behavioral-Neurology-An-Evolutionary-Perspective-by-Michael-Hoffmann-auth-z-lib-org

[^1_10]: https://theses.hal.science/tel-04316336v1/file/2023TOU30057b.pdf

[^1_11]: https://physionet.org/files/deid/1.1/dict/sno_edited.txt?download

[^1_12]: https://www.science.gov/topicpages/s/spl+white+noise.html

[^1_13]: https://moge.ai/fr/product/agno

[^1_14]: https://www.ghostcrab.be/architecture.html

[^1_15]: https://www.academia.edu/8092510/Angela_Merkel_Dysexekutives_Syndrom

[^1_16]: https://blent.ai/blog/a/memoire-agents-ia

[^1_17]: https://www.tella.tv/video/ontologies-avec-ghostcrab-et-mindbrain-98et

[^1_18]: https://www.agno.com

[^1_19]: https://techsy.io/fr/blog/meilleurs-outils-memoire-agent-ia

[^1_20]: https://docs.mem0.ai/integrations/agno

[^1_21]: https://www.databricks.com/fr/blog/memory-scaling-ai-agents

[^1_22]: https://www.youtube.com/watch?v=aKCgiq9z7JA

[^1_23]: https://mintlify.wiki/Arindam200/awesome-ai-apps/examples/memory/agno-memory

[^1_24]: https://docs.agno.com/examples/tools/mcp-tools

[^1_25]: https://spacesail.mintlify.app/concepts/memory/overview

[^1_26]: https://note.com/insyo99/n/n5e220d4201d8

[^1_27]: https://www.youtube.com/watch?v=WyQT4RWASSY

[^1_28]: https://agno.mintlify.app/memory/memory

[^1_29]: https://www.youtube.com/watch?v=3WCD0ziGC5g

[^1_30]: https://mintlify.wiki/Arindam200/awesome-ai-apps/guides/patterns/memory-systems


---

# skill.md — Bootstrapping an ontology with GhostCrab Architect (Agno agent)

> **Execution context**: this skill targets an Agno agent (Python), Codex, or Claude Code implementing Agno. It describes the full sequence to create and populate a MindBrain ontology via GhostCrab MCP, from type definitions through populated entities and persisted relations.

***

## Prerequisites

- GhostCrab MCP is running and reachable (`http://localhost:8080/mcp` or stdio)
- MindBrain PostgreSQL is connected and extensions `pg_dgraph`, `pg_facets`, `pg_pragma` are enabled
- Target namespace is defined (e.g. `project_alpha`)
- Agno `>=0.7` installed (`pip install agno`)

***

## Step 1 — Configure the Agno agent with MCPTools

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools
from agno.storage.postgres import PostgresStorage

# Transport: streamable-http (recommended), or stdio when GhostCrab runs locally
ghostcrab_tools = MCPTools(
    transport="streamable-http",
    url="http://localhost:8080/mcp",
    # Timeout in seconds for long operations (full bootstrap)
    timeout=120,
)

architect_agent = Agent(
    name="GhostCrabArchitect",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[ghostcrab_tools],
    # Disable local memory: MindBrain is the single registry
    enable_user_memories=False,
    storage=PostgresStorage(
        table_name="architect_sessions",
        db_url="postgresql://user:pass@localhost:5432/mindbrain",
    ),
    instructions=[
        "You are an ontology architect. Use only GhostCrab tools.",
        "Always check that a type exists before creating one (call `ontology_type_get`).",
        "Always use the namespace supplied on every tool invocation.",
        "After each type or entity creation, confirm with a read-back call.",
    ],
    markdown=True,
)
```


***

## Step 2 — Ontology bootstrap sequence

### 2.1 Create types (EntityTypes)

The agent must call tools in this strict order :

```python
bootstrap_prompt = """
Bootstrap the ontology for namespace 'project_alpha' with this sequence:

1. CREATE ENTITY TYPES :
   - Type: Agent        | facets: [name, role, status, framework]
   - Type: Task         | facets: [title, status, priority, assignee_id]
   - Type: Document     | facets: [title, content_hash, source_url, created_at]
   - Type: Concept      | facets: [label, domain, definition]

2. CREATE RELATION TYPES :
   - Relation: ASSIGNED_TO   | from: Task   → to: Agent
   - Relation: REFERENCES    | from: Task   → to: Document
   - Relation: RELATED_TO    | from: Concept → to: Concept  | bidirectional: true
   - Relation: KNOWS_ABOUT   | from: Agent  → to: Concept

3. VALIDATE: call ontology_schema_get for namespace='project_alpha'
   and return the full schema JSON.
"""

result = architect_agent.run(bootstrap_prompt)
print(result.content)
```


### 2.2 Seed initial entities

```python
seed_prompt = """
In namespace 'project_alpha', create the following seed entities:

AGENTS :
- name='ResearchAgent', role='researcher', status='active', framework='agno'
- name='WriterAgent',   role='writer',     status='active', framework='agno'
- name='OrchestratorAgent', role='orchestrator', status='active', framework='agno'

CONCEPTS :
- label='Context Sharing', domain='agentic_systems',
  definition='How multiple agents read and write one shared knowledge registry.'
- label='Ontological Persistence', domain='agentic_systems',
  definition='Entities and relationships survive beyond a single agent session.'

Then create relations:
- ResearchAgent  KNOWS_ABOUT  'Context Sharing'
- WriterAgent    KNOWS_ABOUT  'Context Sharing'
- 'Context Sharing' RELATED_TO 'Ontological Persistence'

Confirm each entity with an entity_get call.
"""

architect_agent.run(seed_prompt)
```


***

## Step 3 — Verify populated schema

```python
verify_prompt = """
For namespace 'project_alpha' :
1. Call ontology_schema_get → list every defined type and relation.
2. Call entity_search with filter={type:'Agent'} → list every agent.
3. Call graph_traverse from entity 'ResearchAgent', depth=2.
Return a structured Markdown report with all three call results.
"""

verification = architect_agent.run(verify_prompt)
print(verification.content)
```


***

## Step 4 — Deep memory integration (optional)

For native Agno memory to write automatically into MindBrain after each run :

```python
from agno.memory.v2.db.base import MemoryDb
from agno.memory.v2.memory import Memory
from agno.memory.v2.schema import UserMemory
import psycopg2, json

class MindBrainMemoryDb(MemoryDb):
    """Agno MemoryDb backend wired to MindBrain via pg_facets."""

    def __init__(self, dsn: str, namespace: str):
        self.conn = psycopg2.connect(dsn)
        self.namespace = namespace

    def upsert_memory(self, memory: UserMemory) -> UserMemory:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT mindbrain.entity_upsert(%s, 'AgentMemory', %s::jsonb)
                """,
                (self.namespace, json.dumps({
                    "agent_id": memory.user_id,
                    "content":  memory.memory,
                    "topics":   memory.topics or [],
                }))
            )
            self.conn.commit()
        return memory

    def search_memories(self, query: str, user_id: str, limit: int = 5):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT mindbrain.facet_search(%s, 'AgentMemory', %s, %s)
                """,
                (self.namespace, query, limit)
            )
            rows = cur.fetchall()
        return [UserMemory(memory=r[0]) for r in rows]
```
