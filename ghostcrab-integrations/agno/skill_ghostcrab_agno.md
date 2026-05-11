# skill.md — Bootstrapping an Ontology with GhostCrab Architect (Agno Agent)

> **Execution context**: this skill targets an Agno agent (Python), Codex, or Claude Code implementing Agno. It describes the full sequence to create and populate a MindBrain ontology via GhostCrab MCP, from type definitions through populated entities and persisted relations.

---

## Prerequisites

- GhostCrab MCP is running and reachable (`http://localhost:8080/mcp` or stdio)
- MindBrain PostgreSQL is connected and extensions `pg_dgraph`, `pg_facets`, `pg_pragma` are enabled
- Target namespace is defined (e.g. `project_alpha`)
- Agno `>=0.7` installed (`pip install agno`)

---

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
        "Always pass the supplied namespace on every tool invocation.",
        "After each type or entity creation, confirm persistence with a read-back call.",
    ],
    markdown=True,
)
```

---

## Step 2 — Ontology bootstrap sequence

### 2.1 Create types (EntityTypes)

The agent must invoke tools in this strict order:

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
   and return the full schema as JSON.
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
  definition='Persistence of entities and relations beyond agent session lifecycle.'

Then create relations :
- ResearchAgent  KNOWS_ABOUT  'Context Sharing'
- WriterAgent    KNOWS_ABOUT  'Context Sharing'
- 'Context Sharing' RELATED_TO 'Ontological Persistence'

Confirm each created entity via entity_get.
"""

architect_agent.run(seed_prompt)
```

---

## Step 3 — Verify populated schema

```python
verify_prompt = """
For namespace 'project_alpha' :
1. Call ontology_schema_get → list every defined type and relation.
2. Call entity_search with filter={type:'Agent'} → list every agent.
3. Call graph_traverse from entity 'ResearchAgent', depth=2.
Return a structured Markdown report with all three results.
"""

verification = architect_agent.run(verify_prompt)
print(verification.content)
```

---

## Step 4 — Deep memory integration (optional)

To have native Agno memory write into MindBrain automatically after each run:

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
        return [UserMemory(memory=r[0]['content'], user_id=user_id) for r in rows]

# Attach to agent
memory_backend = Memory(
    model=Claude(id="claude-haiku-3-5"),
    db=MindBrainMemoryDb(
        dsn="postgresql://user:pass@localhost:5432/mindbrain",
        namespace="project_alpha",
    ),
)

architect_agent_with_memory = Agent(
    name="GhostCrabArchitect",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[ghostcrab_tools],
    memory=memory_backend,
    enable_user_memories=True,  # auto extraction after each run
)
```

---

## Step 5 — Multi-agent with shared namespace

Pattern for an Agno team where every agent reads/writes one MindBrain registry:

```python
from agno.team import Team

research_agent = Agent(
    name="ResearchAgent",
    model=Claude(id="claude-haiku-3-5"),
    tools=[ghostcrab_tools],
    enable_user_memories=False,
)

writer_agent = Agent(
    name="WriterAgent",
    model=Claude(id="claude-haiku-3-5"),
    tools=[ghostcrab_tools],
    enable_user_memories=False,
)

team = Team(
    name="OntologyTeam",
    agents=[research_agent, writer_agent],
    model=Claude(id="claude-sonnet-4-5"),
    # Orchestrator uses GhostCrab for coordination too
    tools=[ghostcrab_tools],
)

# Each agent may call entity_get / entity_upsert on the same namespace
# → no silos: facts discovered by ResearchAgent are visible to WriterAgent
team.run(
    "ResearchAgent : find Concept entities in namespace='project_alpha'. "
    "WriterAgent : summarize the concepts discovered."
)
```

---

## GhostCrab tools exposed via MCP

| MCP tool                   | Purpose                                                       | Key parameters                             |
|----------------------------|---------------------------------------------------------------|--------------------------------------------|
| `ontology_type_create`     | Define an EntityType with facets                               | `namespace`, `type_name`, `facets[]`       |
| `ontology_type_get`        | Fetch an existing type (idempotence check)                    | `namespace`, `type_name`                   |
| `ontology_relation_create` | Define a directed RelationType between EntityTypes           | `namespace`, `name`, `from`, `to`           |
| `ontology_schema_get`      | Full namespace schema                                          | `namespace`                               |
| `entity_upsert`            | Create or update an entity                                      | `namespace`, `type`, `facets{}`             |
| `entity_get`               | Fetch by id or unique facet slice                              | `namespace`, `id` or `filter{}`           |
| `entity_search`            | Multi-criteria faceted search                                  | `namespace`, `filter{}`, `limit`          |
| `relation_create`          | Link two entities                                              | `namespace`, `from_id`, `to_id`, `type`     |
| `graph_traverse`           | Traverse graph from a node (BFS/DFS)                           | `namespace`, `from_id`, `depth`           |
| `context_push`             | Inject structured context into current session                 | `namespace`, `session_id`, `payload{}`      |

---

## Usage rules for the agent

1. **Idempotence**: always call `ontology_type_get` before `ontology_type_create`. Skip creation if type exists.
2. **Namespace isolation**: never omit the `namespace` argument.
3. **Confirmation**: after every `entity_upsert`, call `entity_get` to verify persistence.
4. **Relations after entities**: create entities before edges that reference them.
5. **No duplicate local registry**: unless `MindBrainMemoryDb` is wired, keep `enable_user_memories=False` to avoid split sources of truth.

---

## Example one-shot full run

```python
full_bootstrap = """
You are GhostCrabArchitect. Run the complete bootstrap for ontology 'project_alpha'.

Phase 1 – Schema :
  Create types Agent, Task, Document, Concept with their facets.
  Create relations ASSIGNED_TO, REFERENCES, RELATED_TO, KNOWS_ABOUT.

Phase 2 – Seed :
  Create 3 agents (ResearchAgent, WriterAgent, OrchestratorAgent).
  Create 2 concepts (Context Sharing, Ontological Persistence).
  Link agents to concepts via KNOWS_ABOUT.
  Link concepts via RELATED_TO.

Phase 3 – Validation :
  Call ontology_schema_get.
  Call graph_traverse from OrchestratorAgent depth=2.
  Return Markdown report : types created, entities created, relations created, graph excerpt.
"""

final_report = architect_agent.run(full_bootstrap)
print(final_report.content)
```

---

## Implementation notes

- **Preferred transport**: `streamable-http` for multi-agent setups (concurrent sessions). Use `stdio` for single-agent local testing.
- **Timeout**: set at least 120s for full bootstrap (seed + edges = many sequential calls).
- **Logging**: enable Agno debug (`export AGNO_LOG_LEVEL=debug`) to trace MCP tool traffic and troubleshoot GhostCrab connectivity.
- **Rollback**: MindBrain supports PostgreSQL transactions. After a partial failure, invoke `ontology_schema_reset(namespace)` (GhostCrab admin tooling; not necessarily part of baseline MCP expose).
