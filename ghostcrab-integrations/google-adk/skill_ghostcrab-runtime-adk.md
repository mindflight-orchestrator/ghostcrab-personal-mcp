---
name: ghostcrab-runtime-adk
version: 2.0
description: |
  Runtime pattern for Google ADK agents that use GhostCrab Personal as shared
  local project memory through MCP stdio and the public ghostcrab_* tools.
triggers:
  - "ADK runtime memory"
  - "ADK shared context"
  - "coordinate ADK agents"
  - "resume ADK session"
  - "track ADK blockers"
  - "record ADK progress"
---

# Skill: GhostCrab Runtime for Google ADK

## Purpose

Use this skill when an ADK agent, sub-agent, or orchestrator needs shared state
that survives ADK sessions.

GhostCrab Personal is the source of durable project memory. ADK remains the agent
runtime. GhostCrab does not replace ADK sessions, tools, or artifacts; it gives
them a local SQLite memory surface through MCP.

## Runtime Baseline

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Default transport is local `stdio`. The public tools are named `ghostcrab_*`.

Legacy labels from older drafts are historical only. Do not expose them as MCP
tools. Use the public `ghostcrab_*` mappings in this skill.

## ADK Session Mapping

One ADK project maps to one GhostCrab `workspace_id`.

Individual ADK `session_id` values are facets inside that workspace. This lets
multiple sessions, runners, and sub-agents contribute to the same project memory
without fragmenting context.

```json
{
  "workspace_id": "adk-research-agent",
  "facets": {
    "adk_session_id": "session-2026-05-10-a",
    "agent_name": "research_worker",
    "record_type": "progress",
    "status": "in_progress"
  }
}
```

## Start-of-Run Sequence

Every ADK run starts with:

1. `ghostcrab_status`
2. `ghostcrab_workspace_list`
3. `ghostcrab_workspace_create` if the project workspace is missing
4. `ghostcrab_pack` for a compact recovery briefing

An empty pack is normal on the first session. Continue with the user task and
write the first useful record.

## Worker Instruction Template

```text
You are an ADK worker using GhostCrab Personal as shared local project memory.

Before work:
1. Call ghostcrab_status.
2. Call ghostcrab_workspace_list and select the workspace for this ADK project.
3. If the workspace is absent, call ghostcrab_workspace_create once.
4. Call ghostcrab_pack with the workspace scope. If it is empty, continue.

During work:
- Use ghostcrab_search for prior decisions, constraints, and facts.
- Use ghostcrab_remember for durable observations and decisions.
- Use ghostcrab_upsert for mutable current task, blocker, artifact, or phase state.
- Use ghostcrab_learn for dependency, blocker, handoff, or evidence links.

After work:
- Use ghostcrab_project to leave a compact goal, step, or constraint heartbeat.
- Use ghostcrab_upsert to update the current state record.
```

## Orchestrator Instruction Template

```text
You are an ADK orchestrator reading GhostCrab as the project dashboard.

Each control cycle:
1. Call ghostcrab_pack for the project workspace.
2. Call ghostcrab_count grouped by status, agent_name, or record_type.
3. Call ghostcrab_search for active blockers and in-progress records.
4. Call ghostcrab_traverse when a blocker or dependency chain needs explanation.
5. Record routing decisions with ghostcrab_remember.
6. Update current assignments or phase state with ghostcrab_upsert.
7. Link assignments, blockers, and dependencies with ghostcrab_learn.
```

## Tool Mapping

| Historical scenario label | Use this GhostCrab tool |
| --- | --- |
| get my task | `ghostcrab_pack` plus `ghostcrab_search` filtered by `agent_name` and `status` |
| update status | `ghostcrab_upsert` |
| log progress | `ghostcrab_remember` for immutable notes, `ghostcrab_upsert` for current progress |
| flag blocker | `ghostcrab_upsert` for blocker state and `ghostcrab_learn` for what it blocks |
| complete task | `ghostcrab_upsert` status to `done`, then `ghostcrab_remember` the result |
| project snapshot | `ghostcrab_count`, `ghostcrab_pack`, `ghostcrab_search` |
| phase readiness | `ghostcrab_count` plus explicit orchestrator rules |
| dependency chain | `ghostcrab_traverse` |
| active goals | `ghostcrab_project` |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. ADK workers and orchestrators can pass `mode="hybrid"` without changing workspace/session semantics.

## Remember vs Upsert

Use `ghostcrab_remember` when preserving a durable fact, decision, observation,
or result:

```text
ghostcrab_remember(
  workspace_id="adk-research-agent",
  content="The extraction worker found that vendor invoices use three date formats.",
  facets={
    "record_type": "finding",
    "adk_session_id": "session-2026-05-10-a",
    "agent_name": "extraction_worker",
    "confidence": 0.9
  }
)
```

Use `ghostcrab_upsert` when maintaining the latest state for a task, phase,
blocker, artifact, or agent slot:

```text
ghostcrab_upsert(
  workspace_id="adk-research-agent",
  schema_id="adk:runtime-state",
  match={ "facets": { "record_id": "task:invoice-normalization" } },
  create_if_missing=true,
  set_content="Invoice normalization is in review; sample coverage is 82%.",
  set_facets={
    "record_id": "task:invoice-normalization",
    "record_type": "task_state",
    "status": "review",
    "agent_name": "normalization_worker",
    "adk_session_id": "session-2026-05-10-a"
  }
)
```

## Runtime Lifecycle

| Moment | Worker behavior | Orchestrator behavior |
| --- | --- | --- |
| Before | `ghostcrab_status`, workspace lookup/create, `ghostcrab_pack` | Same, then `ghostcrab_count` for dashboard shape |
| Read | `ghostcrab_search` for relevant facts and constraints | `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_traverse` |
| Write | `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn` | Same for decisions, assignments, blockers |
| After | `ghostcrab_project` and final `ghostcrab_upsert` | `ghostcrab_project` for the next control objective |
| Recovery | Treat `ghostcrab_pack` as the restart briefing | Rebuild dashboard from `ghostcrab_pack` and counts |

## Agent Performance Contract

1. Map one ADK project to one GhostCrab workspace. Keep `session_id` as a facet, not as the workspace boundary.
2. Start each ADK run with `ghostcrab_status`, `ghostcrab_workspace_list`, and `ghostcrab_pack`; create only missing workspaces.
3. Persist durable observations with `ghostcrab_remember`; update live session, task, blocker, or artifact state with `ghostcrab_upsert`.
4. Use stable `record_id` values while preserving `adk_session_id` for traceability.
5. Write a `ghostcrab_project` handoff before the ADK session ends so the next session can resume cleanly.

## Practical Patterns

### Record progress

1. `ghostcrab_remember` the completed step as an observation.
2. `ghostcrab_upsert` the task state with the current status.
3. `ghostcrab_project` the next step if another session must resume it.

### Flag a blocker

1. `ghostcrab_upsert` a blocker record with `status: "active"`.
2. `ghostcrab_learn` an edge from the blocked task to the blocker.
3. `ghostcrab_project` a blocking constraint so the next run sees it in the pack.

### Complete a task

1. `ghostcrab_remember` the result and evidence.
2. `ghostcrab_upsert` the task state to `done`.
3. `ghostcrab_learn` result links to affected artifacts or downstream tasks.

## Failure Modes

| Situation | Response |
| --- | --- |
| GhostCrab is unavailable | Tell the user to run `gcp brain up`; do not continue as if memory was written. |
| Workspace is missing | Call `ghostcrab_workspace_create` once for the ADK project, then continue. |
| `ghostcrab_pack` is empty | First run is expected; continue and write useful state. |
| Search is empty | Continue with current task, but record uncertainty or ask a targeted question. |
| Schema is missing | Use stable facets and provisional `schema_id` names; inspect schemas later with `ghostcrab_schema_list`. |
| Conflicting updates | Prefer stable `record_id` and `ghostcrab_upsert` for current state. Preserve important rationale with `ghostcrab_remember`. |

## PRO Note

This runtime guide targets GhostCrab Personal SQLite. PostgreSQL is only the PRO
path for centralized multi-user infrastructure after a local ADK workflow is
validated.
