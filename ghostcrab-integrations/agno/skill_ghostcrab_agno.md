# skill.md — Bootstrapping an Ontology with GhostCrab Architect (Agno Agent)

> **Execution context**: this skill targets an Agno agent (Python), Codex, or Claude Code implementing Agno. It describes the full sequence to create and populate a MindBrain ontology via GhostCrab Personal MCP (SQLite), from schema registration through populated entities and persisted relations.

---

## Prerequisites

- GhostCrab Personal is reachable via `gcp brain up` (stdio MCP)
- Target workspace is defined (e.g. `project_alpha`)
- Agno `>=0.7` installed (`pip install agno`)

---

## Step 1 — Configure the Agno agent with MCPTools

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools

ghostcrab_tools = MCPTools(
    transport="stdio",
    command="gcp",
    args=["brain", "up"],
    timeout=120,
)

architect_agent = Agent(
    name="GhostCrabArchitect",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[ghostcrab_tools],
    enable_user_memories=False,
    instructions=[
        "You are an ontology architect. Use only GhostCrab MCP tools.",
        "Call ghostcrab_status first, then ghostcrab_workspace_list before selecting a workspace.",
        "Get explicit user confirmation before ghostcrab_schema_register or bulk writes.",
        "After each write, confirm persistence with ghostcrab_search or ghostcrab_schema_inspect.",
    ],
    markdown=True,
)
```

---

## Step 2 — Ontology bootstrap sequence

### 2.1 Create workspace and schema

The agent must invoke tools in this strict order:

```python
bootstrap_prompt = """
Bootstrap the ontology for workspace 'project_alpha' with this sequence:

1. Call ghostcrab_status.
2. Call ghostcrab_workspace_list, then ghostcrab_workspace_create for 'project_alpha' if missing.
3. Call ghostcrab_modeling_guidance with the domain goal: multi-agent project with Agent, Task, Document, Concept types.
4. After user confirmation, register schemas for:
   - ghostcrab:task (title, status, priority, assignee_id)
   - ghostcrab:note (title, content, source_url, created_at)
   - agent:observation (label, domain, definition)
5. Call ghostcrab_schema_list and ghostcrab_schema_inspect to validate registration.
"""

result = architect_agent.run(bootstrap_prompt)
print(result.content)
```

### 2.2 Seed initial entities

```python
seed_prompt = """
In workspace 'project_alpha', create the following seed records:

AGENTS (ghostcrab_remember):
- ResearchAgent: role=researcher, status=active, framework=agno
- WriterAgent: role=writer, status=active, framework=agno
- OrchestratorAgent: role=orchestrator, status=active, framework=agno

CONCEPTS (ghostcrab_remember):
- Context Sharing: domain=agentic_systems, definition=How multiple agents read and write one shared knowledge registry.
- Ontological Persistence: domain=agentic_systems, definition=Persistence of entities and relations beyond agent session lifecycle.

Then create graph links with ghostcrab_learn:
- ResearchAgent KNOWS_ABOUT Context Sharing
- WriterAgent KNOWS_ABOUT Context Sharing
- Context Sharing RELATED_TO Ontological Persistence

Confirm each record via ghostcrab_search.
"""

architect_agent.run(seed_prompt)
```

---

## Step 3 — Verify populated schema

```python
verify_prompt = """
For workspace 'project_alpha':
1. Call ghostcrab_schema_list → list every registered schema.
2. Call ghostcrab_search for agent-related records.
3. Call ghostcrab_traverse from ResearchAgent with depth=2.
Return a structured Markdown report with all three results.
"""

verification = architect_agent.run(verify_prompt)
print(verification.content)
```

---

## Step 4 — Agno memory through MCP (optional)

Do not connect Agno memory directly to SQLite. Route durable facts through GhostCrab MCP:

```python
memory_agent = Agent(
    name="GhostCrabArchitect",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[ghostcrab_tools],
    enable_user_memories=False,
    instructions=[
        "After each run, store durable findings with ghostcrab_remember.",
        "Store mutable task state with ghostcrab_upsert.",
        "Never write to a separate local memory table for shared project facts.",
    ],
)
```

---

## Step 5 — Multi-agent with shared workspace

Pattern for an Agno team where every agent reads/writes one GhostCrab workspace:

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
    tools=[ghostcrab_tools],
)

team.run(
    "ResearchAgent: search workspace='project_alpha' for Concept records. "
    "WriterAgent: summarize the concepts discovered."
)
```

---

## GhostCrab tools exposed via MCP

| MCP tool                    | Purpose                               | Key parameters                    |
| --------------------------- | ------------------------------------- | --------------------------------- |
| `ghostcrab_status`          | Runtime health and routing            | —                                 |
| `ghostcrab_workspace_list`  | List workspaces                       | —                                 |
| `ghostcrab_workspace_create`| Create workspace                      | `workspace_id`                    |
| `ghostcrab_modeling_guidance` | Domain modeling guidance            | natural-language goal             |
| `ghostcrab_schema_register` | Register a schema                     | `schema_id`, fields               |
| `ghostcrab_schema_list`     | List registered schemas               | `workspace_id`                    |
| `ghostcrab_schema_inspect`  | Inspect one schema                    | `schema_id`                       |
| `ghostcrab_remember`        | Create durable fact                   | `schema_id`, facets               |
| `ghostcrab_upsert`          | Update mutable current state          | `record_id`, facets               |
| `ghostcrab_search`          | Faceted / BM25 search                 | `schema_id`, filters              |
| `ghostcrab_learn`           | Create graph relation                 | source, target, label             |
| `ghostcrab_traverse`        | Traverse graph from a node            | `from_id`, depth                  |
| `ghostcrab_pack`            | Compact recovery context              | query, `workspace_id`             |
| `ghostcrab_project`         | Active run projections                | goal, step, constraint            |

---

## Usage rules for the agent

1. **Confirmation**: get user confirmation before `ghostcrab_schema_register` or bulk ontology changes.
2. **Workspace isolation**: select or create the workspace before writes.
3. **Read-back**: after every `ghostcrab_remember`, call `ghostcrab_search` to verify persistence.
4. **Relations after entities**: create records before graph edges that reference them.
5. **Single source of truth**: keep `enable_user_memories=False`; route shared facts through GhostCrab MCP.

---

## Example one-shot full run

```python
full_bootstrap = """
You are GhostCrabArchitect. Run the complete bootstrap for workspace 'project_alpha'.

Phase 1 – Schema:
  Register task, note, and observation schemas after modeling guidance and user confirmation.

Phase 2 – Seed:
  Create 3 agents and 2 concepts with ghostcrab_remember.
  Link agents to concepts via ghostcrab_learn.

Phase 3 – Validation:
  Call ghostcrab_schema_list.
  Call ghostcrab_traverse from OrchestratorAgent depth=2.
  Return Markdown report: schemas registered, records created, relations created, graph excerpt.
"""

final_report = architect_agent.run(full_bootstrap)
print(final_report.content)
```

---

## Implementation notes

- **Preferred transport**: `stdio` with `gcp brain up` for local SQLite Personal workflows.
- **Timeout**: set at least 120s for full bootstrap (seed + edges = many sequential calls).
- **Logging**: enable Agno debug (`export AGNO_LOG_LEVEL=debug`) to trace MCP tool traffic.
- **Storage**: GhostCrab Personal persists to local SQLite automatically; no DSN or migration step is required.
