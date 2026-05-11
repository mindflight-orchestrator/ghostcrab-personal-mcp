# skill.md — GhostCrab Runtime: Agentic Orchestration with MindBrain

> **Scope**: general-purpose skill for any Agno agent (worker, orchestrator, specialist) operating inside an ontology-driven workflow. Covers project management, knowledge graph evolution, progress tracking, and team control via `pg_pragma` projections.
>
> **Prerequisites**: GhostCrab MCP live, MindBrain PostgreSQL reachable with `pg_dgraph`, `pg_facets`, `pg_pragma` enabled; namespace declared.

---

## Universal data model (runtime ontology)

Before any run the namespace must include these entity types—they form runtime foundation.

### Entity types

| EntityType      | Required facets                                                          | Optional facets                                   |
|-----------------|---------------------------------------------------------------------------|---------------------------------------------------|
| `Project`       | `name`, `status`, `phase`, `created_at`                                  | `description`, `deadline`, `owner_agent`          |
| `Task`          | `title`, `status`, `priority`, `phase`, `project_id`                     | `assignee`, `depends_on[]`, `result_ref`          |
| `Agent`         | `name`, `role`, `status`, `framework`                                    | `capabilities[]`, `current_task_id`               |
| `KnowledgeNode` | `label`, `domain`, `content`                                            | `source_ref`, `confidence`, `verified`            |
| `Checkpoint`    | `phase`, `project_id`, `status`, `evaluated_at`                          | `blocking_tasks[]`, `next_phase`                  |
| `Event`         | `type`, `source_agent`, `timestamp`, `payload`                           | `target_agent`, `project_id`                      |

### Canonical statuses

```
Task.status    : pending | in_progress | blocked | done | failed | skipped
Project.status : draft | active | paused | completed | cancelled
Agent.status   : idle | running | waiting | error | terminated
Checkpoint.status : pending | evaluating | passed | failed
```

### Relation types

| Relation     | From          | To             | Semantics                                                     |
|--------------|---------------|----------------|---------------------------------------------------------------|
| `ASSIGNED_TO`| Task          | Agent          | Task entrusted to agent                                       |
| `DEPENDS_ON` | Task          | Task           | Precedence constraint                                         |
| `BELONGS_TO` | Task          | Project        | Task belongs to project                                       |
| `PRODUCED`   | Agent         | KnowledgeNode  | Agent produced this knowledge artifact                        |
| `REFERENCES` | Task          | KnowledgeNode  | Task consumes/references node                               |
| `TRIGGERS`   | Checkpoint    | Task           | Checkpoint gates downstream tasks                             |
| `RELATED_TO` | KnowledgeNode | KnowledgeNode  | Semantic link (treat as bidirectional)                         |

---

## Project lifecycle (phases and transitions)

```
PHASE 0 : bootstrap     → ontology seeded, agents registered
PHASE 1 : planning      → tasks created, dependencies declared, priorities set
PHASE 2 : execution     → agents assigned, tasks in_progress, KnowledgeNodes emitted
PHASE 3 : review        → checkpoints evaluated, blocking tasks flagged
PHASE 4 : consolidation → knowledge graph tightened, aggregates produced
PHASE 5 : completed     → Project.status = completed, final report emitted
```

Phase transitions are **always** triggered by orchestrator Checkpoint evaluation.

---

## Step 1 — Runtime bootstrap (run once per namespace)

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools
from agno.storage.postgres import PostgresStorage

MINDBRAIN_DSN = "postgresql://user:pass@localhost:5432/mindbrain"
NAMESPACE = "my_project"

ghostcrab = MCPTools(
    transport="streamable-http",
    url="http://localhost:8080/mcp",
    timeout=120,
)

orchestrator = Agent(
    name="Orchestrator",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[ghostcrab],
    enable_user_memories=False,
    storage=PostgresStorage(table_name="orchestrator_sessions", db_url=MINDBRAIN_DSN),
    instructions=[
        f"The active namespace is {NAMESPACE}. Never omit it in tool calls.",
        "Check existence before any create operation (idempotence).",
        "Create entities before relations that involve them.",
        "After each phase transition: emit an Event of type 'phase_transition'.",
    ],
    markdown=True,
)

BOOTSTRAP_PROMPT = f"""
Bootstrap the full runtime for namespace='{NAMESPACE}'.

PHASE 0 — Schema :
Create EntityTypes : Project, Task, Agent, KnowledgeNode, Checkpoint, Event
with facets as described in this skill.

Create RelationTypes : ASSIGNED_TO, DEPENDS_ON, BELONGS_TO,
PRODUCED, REFERENCES, TRIGGERS, RELATED_TO.

PHASE 0 — Seed :
Create master project :
  Project name='main', status='draft', phase='planning', created_at=now()

Register available agents :
  Agent name='ResearchAgent', role='researcher', status='idle', framework='agno'
  Agent name='WriterAgent',   role='writer',     status='idle', framework='agno'
  Agent name='ReviewAgent',   role='reviewer',   status='idle', framework='agno'
  Agent name='Orchestrator',  role='orchestrator', status='running', framework='agno'

Validate via ontology_schema_get and return the schema formatted in Markdown.
"""

orchestrator.run(BOOTSTRAP_PROMPT)
```

---

## Step 2 — Project management: create and drive tasks

### 2.1 Create tasks with dependencies

```python
PLANNING_PROMPT = f"""
Namespace='{NAMESPACE}'. Phase: planning.

Create the following tasks and link them to project 'main' with BELONGS_TO :

  Task T1 : title='Collect sources', status='pending', priority=1, phase='execution'
  Task T2 : title='Analyze data',    status='pending', priority=2, phase='execution'
  Task T3 : title='Write report',   status='pending', priority=3, phase='execution'
  Task T4 : title='Final review',    status='pending', priority=4, phase='review'

Dependencies (DEPENDS_ON) :
  T2 → T1   (T2 starts only once T1 is done)
  T3 → T2
  T4 → T3

Assignments (ASSIGNED_TO) :
  T1 → ResearchAgent
  T2 → ResearchAgent
  T3 → WriterAgent
  T4 → ReviewAgent

Create end-of-phase Checkpoint for phase 'execution' :
  Checkpoint phase='execution', project_id=<main_id>,
  status='pending', blocking_tasks=[T1,T2,T3], next_phase='review'

Update Project 'main': status='active', phase='execution'.
Emit Event: type='phase_transition', source_agent='Orchestrator',
  payload={{'from':'planning','to':'execution'}}, project_id=<main_id>.
"""

orchestrator.run(PLANNING_PROMPT)
```

### 2.2 Refresh task status (worker pattern)

Each worker invokes this pattern after completing work:

```python
def report_task_done(agent: Agent, task_id: str, result_summary: str, namespace: str):
    agent_name = agent.name  # interpolated into LLM-facing instructions below
    agent.run(f"""
    Namespace='{namespace}'.

    1. Update Task id='{task_id}': status='done', result_ref='{result_summary}'
    2. Update Agent name='{agent_name}': status='idle', current_task_id=null
    3. Create KnowledgeNode :
         label='Result:{task_id}', domain='task_output',
         content='{result_summary}', confidence=0.9
       Link this KnowledgeNode to the Task via REFERENCES (alternate convention: Task PRODUCED KnowledgeNode).
    4. Emit Event: type='task_done', source_agent='{agent_name}',
         payload={{'task_id':'{task_id}','status':'done'}}.
    """)
```

---

## Step 3 — Orchestrator control loop via `pg_pragma`

`pg_pragma` publishes **computed projections** over graph state. The orchestrator queries them rather than traversing manually.

### 3.1 Available `pg_pragma` projections

| Projection                      | Returned signal                                                              |
|---------------------------------|-------------------------------------------------------------------------------|
| `pragma_project_progress`       | % tasks done vs total per phase plus blocking backlog                         |
| `pragma_agent_availability`     | idle agents, errored agents, current load                                   |
| `pragma_dependency_readiness`    | Tasks whose dependencies are satisfied (`done`)                               |
| `pragma_checkpoint_evaluation` | Whether Checkpoint can flip to `passed` given blocking tasks                   |
| `pragma_critical_path`          | Ordered critical-path task slice                                              |
| `pragma_knowledge_coverage`     | produced vs expected KnowledgeNodes, uncovered domains                         |

### 3.2 Control loop skeleton

```python
import time

ORCHESTRATION_LOOP_PROMPT = f"""
Namespace='{NAMESPACE}'. You are orchestrator — run one control cycle.

STEP 1 — CURRENT STATE :
  Call pragma_project_progress(namespace='{NAMESPACE}', project='main').
  Call pragma_agent_availability(namespace='{NAMESPACE}').
  Call pragma_dependency_readiness(namespace='{NAMESPACE}', project='main').

STEP 2 — DECISIONS (apply sequentially) :

  RULE A — Restart stuck agent :
    If any Agent.status='error' longer than ~5 minutes :
      → entity_upsert Agent status='idle'
      → emit Event type='agent_restart', payload={{agent, reason='error_recovery'}}

  RULE B — Assign eligible tasks :
    For each pending task surfaced by pragma_dependency_readiness :
      If an idle Agent with matching role exists :
        → entity_upsert Task status='in_progress'
        → entity_upsert Agent status='running', current_task_id=<task_id>
        → emit Event type='task_assigned', payload={{task_id, agent_name}}

  RULE C — Evaluate checkpoints :
    Call pragma_checkpoint_evaluation for the active phase checkpoint.
    If returned status = 'can_pass' :
      → entity_upsert Checkpoint status='passed'
      → trigger phase transition (see Step 4)

  RULE D — Detect blocked phase :
    If pragma_project_progress.blocked_tasks > 0
    AND no assignable task remains :
      → emit Event type='phase_blocked', payload={{blocking_tasks, reason}}
      → entity_upsert Project status='paused'

STEP 3 — REPORT :
  Return Markdown summary :
  - Current phase, progress %
  - Actions taken this cycle
  - Recommended next action
"""

def orchestration_loop(max_cycles: int = 20, interval_s: int = 30):
    for cycle in range(max_cycles):
        print(f"\n=== Cycle {cycle+1} ===")
        result = orchestrator.run(ORCHESTRATION_LOOP_PROMPT)
        print(result.content)

        check = orchestrator.run(f"""
            Call pragma_project_progress namespace='{NAMESPACE}' project='main'.
            If Project.status='completed', respond exactly: PROJECT_FINISHED
            Otherwise respond: CONTINUE
        """)
        if "PROJECT_FINISHED" in check.content:
            print("Project finished. Stopping loop.")
            break
        time.sleep(interval_s)
```

---

## Step 4 — Phase transitions

Trigger transitions only after `pragma_checkpoint_evaluation` returns `can_pass`.

```python
def transition_phase(orchestrator: Agent, project_id: str,
                     current_phase: str, next_phase: str, namespace: str):
    orchestrator.run(f"""
    Namespace='{namespace}'. Phase transition for project_id='{project_id}'.

    1. entity_upsert Checkpoint (phase='{current_phase}') : status='passed', evaluated_at=now()
    2. entity_upsert Project id='{project_id}' : phase='{next_phase}'
    3. Create Checkpoint for new phase '{next_phase}' :
         status='pending', project_id='{project_id}',
         blocking_tasks=<task list belonging to '{next_phase}'>
    4. For Tasks in '{next_phase}' with status='pending' :
         Call pragma_dependency_readiness → assign ready tasks.
    5. Emit Event: type='phase_transition',
         source_agent='Orchestrator',
         payload={{'from':'{current_phase}','to':'{next_phase}'}},
         project_id='{project_id}',
         timestamp=now()
    """)
```

### Standard phase sequence

```
planning → execution    : tasks exist, assignments ready
execution → review      : execution checkpoint cleared (T1+T2+T3 complete)
review → consolidation  : review checkpoint cleared (T4 complete)
consolidation → completed : pragma_knowledge_coverage >= 0.8 AND no blocking backlog
```

---

## Step 5 — Knowledge graph continual enrichment

Workers extend the graph while executing; orchestrator audits coverage via `pragma_knowledge_coverage`.

### Worker enrichment pattern

```python
ENRICH_KNOWLEDGE_PROMPT = """
Namespace='{namespace}'.

You produced an output — enrich knowledge graph :

1. Create KnowledgeNode :
     label='{label}', domain='{domain}', content='{content}',
     source_ref='{source}', confidence={confidence}, verified=false

2. Find semantically neighboring KnowledgeNodes
   via entity_search filter={{type:'KnowledgeNode', domain:'{domain}'}}.

3. For similar nodes (similarity > 0.7) :
     RELATE newly created node RELATED_TO legacy node.

4. Link fresh node → current Task with REFERENCES.

5. entity_upsert Agent '{agent_name}': emit PRODUCED edge → new KnowledgeNode.
"""
```

### Orchestrator coverage query

```python
COVERAGE_PROMPT = f"""
Namespace='{NAMESPACE}'.

1. Call pragma_knowledge_coverage(namespace='{NAMESPACE}', project='main').
   Return domains covered, missing domains, aggregate score.

2. If score < 0.6 :
   Locate Tasks lacking result_ref / produced KnowledgeNodes.
   Reassign idle agents to those Tasks.

3. If score >= 0.8 :
   Mark uncovered KnowledgeNodes for review :
   entity_search filter={{type:'KnowledgeNode', verified:false}}
   → emit Event type='review_needed' for each hit.
"""
```

---

## Step 6 — Shutdown and orderly termination

```python
SHUTDOWN_PROMPT = f"""
Namespace='{NAMESPACE}'. Orderly shutdown of project 'main'.

1. Confirm no Task has status='in_progress' :
   entity_search filter={{type:'Task', status:'in_progress'}}.
   While tasks remain active: defer shutdown.

2. entity_upsert every Agent status='terminated'.

3. entity_upsert Project 'main' : status='completed', phase='completed'.

4. Call pragma_project_progress for final delta.
   Call pragma_knowledge_coverage for knowledge summary.

5. Create rollup KnowledgeNode :
     label='ProjectSummary:main', domain='project_output',
     content=<results digest>, verified=true

6. Emit Event: type='project_completed', source_agent='Orchestrator',
     payload={{total_tasks, total_nodes, final_coverage_score}}.
"""

orchestrator.run(SHUTDOWN_PROMPT)
```

---

## MCP quick-reference by agent role

### Worker agents (ResearchAgent, WriterAgent, …)

```
entity_get          → read assigned Task
entity_upsert       → update Task.status, Agent.status
ontology_type_get   → sanity-check schema before novelty
entity_upsert       → create KnowledgeNode
relation_create     → wire KnowledgeNode to Task (REFERENCES), Agent (PRODUCED)
context_push        → share intermediate cues with orchestrator
```

### Orchestrator

```
pragma_project_progress      → global progress telemetry
pragma_agent_availability    → idle/error roster
pragma_dependency_readiness  → runnable backlog
pragma_checkpoint_evaluation → phase transition guard
pragma_critical_path         → prioritization signal
pragma_knowledge_coverage    → KG health
entity_upsert                → Task / Agent / Project / Checkpoint edits
entity_search                → situational dashboards
graph_traverse               → pivot exploration
```

---

## Invariants

1. **One namespace per project** — never relate entities spanning namespaces.
2. **Idempotence** — probe with `entity_get` / `ontology_type_get` ahead of inserts.
3. **Operation ordering** — Entities → Relations → Events. Never mint edges before endpoints exist.
4. **Canonical statuses only** — statuses must match `"Canonical statuses"` table; no freestyle literals.
5. **Event journaling** — any meaningful lifecycle move (phase, completion, outage) emits an Event (audit backbone).
6. **No conflicting local memory** — when MindBrain is truth, workers keep `enable_user_memories=False`. Only orchestrators may enable user memory alongside `MindBrainMemoryDb`.
7. **Consult pragma before act** — orchestrator always reads a `pg_pragma` projection before steering; never rely on conversational guesswork alone.
