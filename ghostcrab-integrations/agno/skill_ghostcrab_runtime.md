# skill.md — GhostCrab Runtime: Agentic Orchestration with MindBrain

> **Scope**: general-purpose skill for any Agno agent (worker, orchestrator, specialist) operating inside an ontology-driven workflow. Covers project management, knowledge graph evolution, progress tracking, and team control via `ghostcrab_project` and `ghostcrab_pack` projections.
>
> **Prerequisites**: GhostCrab Personal MCP live via `gcp brain up`; workspace declared.

---

## Universal data model (runtime ontology)

Before any run the workspace must include these schema families—they form the runtime foundation.

### Entity types

| Schema           | Required facets                                      | Optional facets                          |
| ---------------- | ---------------------------------------------------- | ---------------------------------------- |
| `Project`        | `name`, `status`, `phase`, `created_at`              | `description`, `deadline`, `owner_agent` |
| `ghostcrab:task` | `title`, `status`, `priority`, `phase`, `project_id` | `assignee`, `depends_on[]`, `result_ref` |
| `Agent`          | `name`, `role`, `status`, `framework`                | `capabilities[]`, `current_task_id`      |
| `KnowledgeNode`  | `label`, `domain`, `content`                         | `source_ref`, `confidence`, `verified`   |
| `Checkpoint`     | `phase`, `project_id`, `status`, `evaluated_at`      | `blocking_tasks[]`, `next_phase`         |
| `Event`          | `type`, `source_agent`, `timestamp`, `payload`       | `target_agent`, `project_id`             |

### Canonical statuses

```
Task.status    : pending | in_progress | blocked | done | failed | skipped
Project.status : draft | active | paused | completed | cancelled
Agent.status   : idle | running | waiting | error | terminated
Checkpoint.status : pending | evaluating | passed | failed
```

### Relation types

| Relation      | From          | To            | Semantics                              |
| ------------- | ------------- | ------------- | -------------------------------------- |
| `ASSIGNED_TO` | Task          | Agent         | Task entrusted to agent                |
| `DEPENDS_ON`  | Task          | Task          | Precedence constraint                  |
| `BELONGS_TO`  | Task          | Project       | Task belongs to project                |
| `PRODUCED`    | Agent         | KnowledgeNode | Agent produced this knowledge artifact |
| `REFERENCES`  | Task          | KnowledgeNode | Task consumes/references node          |
| `TRIGGERS`    | Checkpoint    | Task          | Checkpoint gates downstream tasks      |
| `RELATED_TO`  | KnowledgeNode | KnowledgeNode | Semantic link (treat as bidirectional) |

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

## Step 1 — Runtime bootstrap (run once per workspace)

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools

WORKSPACE = "my_project"

ghostcrab = MCPTools(
    transport="stdio",
    command="gcp",
    args=["brain", "up"],
    timeout=120,
)

orchestrator = Agent(
    name="Orchestrator",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[ghostcrab],
    enable_user_memories=False,
    instructions=[
        f"The active workspace is {WORKSPACE}. Never omit it in tool calls.",
        "Call ghostcrab_status and ghostcrab_workspace_list before writes.",
        "Use ghostcrab_remember for durable facts and ghostcrab_upsert for mutable state.",
        "After each phase transition: emit an Event of type 'phase_transition'.",
    ],
    markdown=True,
)

BOOTSTRAP_PROMPT = f"""
Bootstrap the full runtime for workspace='{WORKSPACE}'.

PHASE 0 — Workspace :
Call ghostcrab_status.
Ensure workspace '{WORKSPACE}' exists with ghostcrab_workspace_create if needed.

PHASE 0 — Seed :
Create master project with ghostcrab_remember:
  Project name='main', status='draft', phase='planning', created_at=now()

Register available agents with ghostcrab_remember:
  ResearchAgent, WriterAgent, ReviewAgent, Orchestrator

Validate via ghostcrab_schema_list and ghostcrab_search, return schema summary in Markdown.
"""

orchestrator.run(BOOTSTRAP_PROMPT)
```

---

## Step 2 — Project management: create and drive tasks

### 2.1 Create tasks with dependencies

```python
PLANNING_PROMPT = f"""
Workspace='{WORKSPACE}'. Phase: planning.

Create tasks with ghostcrab_upsert and link them with ghostcrab_learn:

  Task T1 : title='Collect sources', status='pending', priority=1, phase='execution'
  Task T2 : title='Analyze data',    status='pending', priority=2, phase='execution'
  Task T3 : title='Write report',   status='pending', priority=3, phase='execution'
  Task T4 : title='Final review',    status='pending', priority=4, phase='review'

Dependencies (DEPENDS_ON via ghostcrab_learn):
  T2 → T1, T3 → T2, T4 → T3

Assignments: store assignee on each task record.

Create Checkpoint for phase 'execution' with ghostcrab_remember.
Update Project 'main': status='active', phase='execution' with ghostcrab_upsert.
"""

orchestrator.run(PLANNING_PROMPT)
```

### 2.2 Refresh task status (worker pattern)

Each worker invokes this pattern after completing work:

```python
def report_task_done(agent: Agent, task_id: str, result_summary: str, workspace: str):
    agent_name = agent.name
    agent.run(f"""
    Workspace='{workspace}'.

    1. ghostcrab_upsert Task id='{task_id}': status='done', result_ref='{result_summary}'
    2. ghostcrab_upsert Agent name='{agent_name}': status='idle', current_task_id=null
    3. ghostcrab_remember KnowledgeNode for result summary
    4. ghostcrab_learn to link KnowledgeNode to Task (REFERENCES)
    """)
```

---

## Step 3 — Orchestrator control loop via projections

Use `ghostcrab_pack`, `ghostcrab_count`, and `ghostcrab_project` instead of custom projection APIs. The orchestrator queries compact views rather than traversing manually.

### 3.1 Available projection patterns

| Pattern               | GhostCrab tool(s)                       | Returned signal                      |
| --------------------- | --------------------------------------- | ------------------------------------ |
| Project progress      | `ghostcrab_count` by task status        | pending / in_progress / done counts  |
| Agent availability    | `ghostcrab_search` on Agent records     | idle, running, error roster          |
| Dependency readiness  | `ghostcrab_traverse` from blocked tasks | runnable backlog                     |
| Checkpoint evaluation | `ghostcrab_pack` with phase question    | whether phase can advance            |
| Recovery context      | `ghostcrab_pack`                        | active goals, blockers, next steps   |
| Active orchestration  | `ghostcrab_project`                     | GOAL / STEP / CONSTRAINT projections |

### 3.2 Control loop skeleton

```python
import time

ORCHESTRATION_LOOP_PROMPT = f"""
Workspace='{WORKSPACE}'. You are orchestrator — run one control cycle.

STEP 1 — CURRENT STATE :
  Call ghostcrab_count for task records grouped by status.
  Call ghostcrab_pack: "Summarize agent availability and blocked tasks."
  Call ghostcrab_search for pending tasks ready to run.

STEP 2 — DECISIONS :
  RULE A — Restart stuck agent: ghostcrab_upsert Agent status='idle' after errors.
  RULE B — Assign eligible tasks: ghostcrab_upsert task to in_progress, assign agent.
  RULE C — Evaluate checkpoints: use ghostcrab_pack to decide phase advance.
  RULE D — Detect blocked phase: ghostcrab_project CONSTRAINT if no assignable work remains.

STEP 3 — REPORT :
  Return Markdown summary: current phase, progress %, actions taken, next action.
"""

def orchestration_loop(max_cycles: int = 20, interval_s: int = 30):
    for cycle in range(max_cycles):
        print(f"\n=== Cycle {cycle+1} ===")
        result = orchestrator.run(ORCHESTRATION_LOOP_PROMPT)
        print(result.content)

        check = orchestrator.run(f"""
            Call ghostcrab_search for Project 'main' status.
            If status='completed', respond exactly: PROJECT_FINISHED
            Otherwise respond: CONTINUE
        """)
        if "PROJECT_FINISHED" in check.content:
            break
        time.sleep(interval_s)
```

---

## Step 4 — Phase transitions

Trigger transitions only after `ghostcrab_pack` confirms checkpoint readiness.

```python
def transition_phase(orchestrator: Agent, project_id: str,
                     current_phase: str, next_phase: str, workspace: str):
    orchestrator.run(f"""
    Workspace='{workspace}'. Phase transition for project_id='{project_id}'.

    1. ghostcrab_upsert Checkpoint (phase='{current_phase}'): status='passed'
    2. ghostcrab_upsert Project id='{project_id}': phase='{next_phase}'
    3. ghostcrab_remember new Checkpoint for phase '{next_phase}'
    4. ghostcrab_search for pending tasks in '{next_phase}' and assign ready tasks
    5. ghostcrab_project refresh with updated GOAL and STEP
    """)
```

---

## Step 5 — Knowledge graph continual enrichment

Workers extend the graph while executing; orchestrator audits coverage via `ghostcrab_search` and `ghostcrab_count`.

### Worker enrichment pattern

```python
ENRICH_KNOWLEDGE_PROMPT = """
Workspace='{workspace}'.

1. ghostcrab_remember KnowledgeNode with label, domain, content, confidence
2. ghostcrab_search for similar KnowledgeNodes in the same domain
3. ghostcrab_learn RELATED_TO edges between similar nodes
4. ghostcrab_learn REFERENCES edge from Task to KnowledgeNode
"""
```

### Orchestrator coverage query

```python
COVERAGE_PROMPT = f"""
Workspace='{WORKSPACE}'.

1. ghostcrab_count KnowledgeNode records by domain.
2. ghostcrab_search for tasks lacking result_ref.
3. If coverage is low, reassign idle agents to incomplete tasks.
4. ghostcrab_pack: "Summarize knowledge coverage gaps."
"""
```

---

## Step 6 — Shutdown and orderly termination

```python
SHUTDOWN_PROMPT = f"""
Workspace='{WORKSPACE}'. Orderly shutdown of project 'main'.

1. ghostcrab_search for Task status='in_progress' — defer shutdown while any remain.
2. ghostcrab_upsert every Agent status='terminated'.
3. ghostcrab_upsert Project 'main': status='completed', phase='completed'.
4. ghostcrab_count final task and knowledge totals.
5. ghostcrab_remember rollup KnowledgeNode with project summary.
6. ghostcrab_project final GOAL: "Project completed."
"""

orchestrator.run(SHUTDOWN_PROMPT)
```

---

## MCP quick-reference by agent role

### Worker agents (ResearchAgent, WriterAgent, …)

```
ghostcrab_search    → read assigned Task
ghostcrab_upsert    → update Task.status, Agent.status
ghostcrab_remember  → create KnowledgeNode
ghostcrab_learn     → wire KnowledgeNode to Task (REFERENCES)
ghostcrab_pack      → share intermediate cues with orchestrator
```

### Orchestrator

```
ghostcrab_count     → progress telemetry by status
ghostcrab_pack      → recovery and checkpoint evaluation
ghostcrab_search    → situational dashboards
ghostcrab_traverse  → dependency and blocker exploration
ghostcrab_project   → active GOAL / STEP / CONSTRAINT
ghostcrab_upsert    → Task / Agent / Project / Checkpoint edits
```

---

## Invariants

1. **One workspace per project** — never relate records spanning workspaces.
2. **Read before write** — use `ghostcrab_search` / `ghostcrab_schema_inspect` before inserts.
3. **Operation ordering** — records → relations → projections. Never mint edges before endpoints exist.
4. **Canonical statuses only** — statuses must match the table above; no freestyle literals.
5. **Single SQLite registry** — workers keep `enable_user_memories=False`; GhostCrab MCP is the shared store.
6. **Consult pack before act** — orchestrator always reads `ghostcrab_pack` or `ghostcrab_count` before steering.
