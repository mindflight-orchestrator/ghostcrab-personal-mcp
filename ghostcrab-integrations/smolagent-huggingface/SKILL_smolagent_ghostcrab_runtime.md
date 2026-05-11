# Skill: GhostCrab Runtime for smolagents

**Scope:** Runtime patterns for smolagents workers and orchestrators that need shared local state through GhostCrab Personal.

smolagents runs Python-generating agents. GhostCrab Personal stores durable facts, current state, and relationships so those agents can recover across runs and coordinate without relying on token history alone.

---

## Runtime Contract

Use real GhostCrab Personal tools:

| Need | Tool |
|---|---|
| Hydrate or recover context | `ghostcrab_pack` |
| Retrieve specific records | `ghostcrab_search` |
| Store durable findings | `ghostcrab_remember` |
| Update latest state | `ghostcrab_upsert` |
| Track active goals and blockers | `ghostcrab_project` |
| Record handoffs and dependencies | `ghostcrab_learn` |
| Traverse relationships | `ghostcrab_traverse` |

For first contact, expose no more than four tools: `ghostcrab_status`, `ghostcrab_pack`, `ghostcrab_remember`, and `ghostcrab_upsert`.

---

## Worker Step Updates

Map smolagents step output to two write paths:

- Durable observation -> `ghostcrab_remember`
- Current run/task status -> `ghostcrab_upsert`

```python
from smolagents import ActionStep, CodeAgent

WORKSPACE_ID = "smolagents-runtime"

def runtime_callback(step: ActionStep, agent: CodeAgent) -> None:
    remember = agent.tools.get("ghostcrab_remember")
    upsert = agent.tools.get("ghostcrab_upsert")

    try:
        if step.error:
            if upsert:
                upsert(
                    match={"facets": {"record_id": "run:worker:latest"}},
                    create_if_missing=True,
                    set_content=f"Worker failed at step {step.step_number}: {step.error}",
                    set_facets={"workspace_id": WORKSPACE_ID, "kind": "run_state", "status": "failed"},
                )
            return

        if step.observations and remember:
            remember(
                content=str(step.observations),
                facets={
                    "workspace_id": WORKSPACE_ID,
                    "kind": "worker_observation",
                    "step_number": step.step_number,
                },
            )

        if upsert:
            upsert(
                match={"facets": {"record_id": "run:worker:latest"}},
                create_if_missing=True,
                set_content=f"Worker completed step {step.step_number}.",
                set_facets={"workspace_id": WORKSPACE_ID, "kind": "run_state", "status": "running"},
            )
    except Exception as exc:
        print(f"GhostCrab runtime write skipped: {exc}")
```

The callback must not fail the main agent run. If GhostCrab is unavailable mid-run, continue without persistence and report that persistence degraded.

---

## Project Progress

Use `ghostcrab_project` for lifecycle records that are more than a single latest-state row:

```python
tools["ghostcrab_project"](
    scope=WORKSPACE_ID,
    proj_type="STEP",
    status="active",
    content="Worker is extracting invoice validation failures.",
    activity_family="smolagents-runtime",
)
```

Use `ghostcrab_upsert` for the latest status of a stable thing:

```python
tools["ghostcrab_upsert"](
    match={"facets": {"record_id": "task:invoice-validation"}},
    create_if_missing=True,
    set_content="Invoice validation is blocked on missing date normalization.",
    set_facets={"workspace_id": WORKSPACE_ID, "kind": "task_state", "status": "blocked"},
)
```

---

## Retrieval and Recovery

Before a run:

```python
pack = tools["ghostcrab_pack"](
    query="resume invoice validation",
    scope=WORKSPACE_ID,
    limit=8,
)

if pack:
    agent.memory.steps = [TaskStep(task=f"Recovered GhostCrab context:\n{pack}", task_images=[])]
else:
    agent.memory.steps = []
```

During a run, use targeted retrieval when the agent needs a specific prior fact:

```python
tools["ghostcrab_search"](
    query="date normalization blocker",
    filters={"workspace_id": WORKSPACE_ID},
    limit=5,
)
```

Recovery rule: `ghostcrab_pack` first, then `ghostcrab_search` for details.

---

## Managed Agent Orchestration

When an orchestrator delegates to a managed agent, write the current assignment and the relationship:

```python
def assign_worker(tools, task_id: str, worker_name: str) -> None:
    tools["ghostcrab_upsert"](
        match={"facets": {"record_id": f"task:{task_id}"}},
        create_if_missing=True,
        set_content=f"Task {task_id} assigned to {worker_name}.",
        set_facets={
            "workspace_id": WORKSPACE_ID,
            "kind": "task_state",
            "status": "assigned",
            "owner": worker_name,
        },
    )
    tools["ghostcrab_learn"](
        edge={
            "source": f"task:{task_id}",
            "target": f"agent:{worker_name}",
            "label": "assigned_to",
            "properties": {"workspace_id": WORKSPACE_ID},
        }
    )
```

The orchestrator should call `ghostcrab_pack` before assigning work and `ghostcrab_search` when filtering open tasks, blockers, or past findings.

---

## Workspace Setup

When a runtime needs a new workspace:

```text
1. ghostcrab_workspace_list
2. if missing, ghostcrab_workspace_create
3. ghostcrab_project for the first goal
4. ghostcrab_upsert for the first latest-state tracker
```

Never create a workspace before listing existing workspaces.

---

## Failure Modes

| Failure | Runtime response |
|---|---|
| GhostCrab unavailable before run | Start `gcp brain up`; if using an HTTP bridge, restart the bridge; verify with `ghostcrab_status`. |
| GhostCrab error during callback | Catch, log, continue the agent run without persistence for that step. |
| Empty recovery pack | Expected for a new workspace. Start with `agent.memory.steps=[]`. |
| Latest state duplicated | Use a stable `record_id` under `match.facets`. |
| Durable facts mixed with state | Move durable evidence to `ghostcrab_remember`; keep only latest status in `ghostcrab_upsert`. |

**PRO note:** mindBrain Pro is the centralized PostgreSQL-backed option for teams. The runtime path here stays GhostCrab Personal, SQLite, and `gcp brain up`.
