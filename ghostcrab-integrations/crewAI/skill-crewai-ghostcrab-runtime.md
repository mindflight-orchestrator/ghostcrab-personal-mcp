# Skill: CrewAI GhostCrab Runtime

## Purpose

Use this skill when a CrewAI run needs operational coordination through GhostCrab Personal: task status, agent updates, durable findings, dependencies, blockers, and recovery.

Default runtime: `gcp brain up`, local SQLite, MCP `stdio`, public `ghostcrab_*` tools.

## Runtime Loop

At the beginning of a crew run:

```text
ghostcrab_status -> ghostcrab_workspace_list -> ghostcrab_pack
```

If the workspace does not exist, call `ghostcrab_workspace_create` before any write.

During the run:

```text
agent update        -> ghostcrab_upsert
durable finding     -> ghostcrab_remember
dependency/blocker  -> ghostcrab_learn
handoff heartbeat   -> ghostcrab_project
```

This is not a custom orchestration layer. CrewAI keeps task execution; GhostCrab stores durable shared state.

## CrewAI Memory Mapping

| CrewAI memory type | Runtime behavior |
| --- | --- |
| Long-term memory | Persist durable findings with `ghostcrab_remember`. |
| Entity memory | Refresh current entity or task state with `ghostcrab_upsert`. |
| Short-term memory | Keep inside CrewAI for the current run. |
| Contextual memory | Keep inside CrewAI prompt/context assembly. |

## Agent Update Contract

Each agent should write only what future agents need:

| Event | Tool | Example facets |
| --- | --- | --- |
| Task started | `ghostcrab_upsert` | `record_id`, `task_id`, `agent_id`, `status: in_progress` |
| Task blocked | `ghostcrab_upsert` and `ghostcrab_learn` | `status: blocked`, `blocks` edge |
| Finding produced | `ghostcrab_remember` | `agent_id`, `task_id`, `kind: finding`, `confidence` |
| Entity updated | `ghostcrab_upsert` | `record_id`, `entity_type`, `entity_name`, `status` |
| Task completed | `ghostcrab_upsert` and `ghostcrab_project` | `status: done`, handoff summary |

## Lifecycle JTBD

| Moment | Agent question | Tool |
| --- | --- | --- |
| Before | What prior project context should I load? | `ghostcrab_pack` |
| Read | What facts or entities match this task? | `ghostcrab_search` |
| Write | Is this a durable fact or mutable current state? | `ghostcrab_remember` or `ghostcrab_upsert` |
| After | What should the next agent see first? | `ghostcrab_project` |
| Recovery | What happened before interruption? | `ghostcrab_pack` |

## Coordinator Pattern

The CrewAI coordinator can create a compact heartbeat after each task:

```text
1. ghostcrab_upsert current task status
2. ghostcrab_remember durable output if it is a finding or decision
3. ghostcrab_learn dependencies/blockers when relevant
4. ghostcrab_project handoff summary
```

Use `ghostcrab_count` for progress views grouped by `status`, `agent_id`, or `task_id`.

Use `ghostcrab_traverse` only when relations matter, such as blocker chains or source-to-report lineage.

## Recovery

When a run restarts:

1. Call `ghostcrab_pack` with the crew goal and workspace.
2. Search for current tasks with `ghostcrab_search`.
3. Resume tasks whose `ghostcrab_upsert` state is `in_progress` or `blocked`.
4. Do not replay durable findings already stored with `ghostcrab_remember`.

## Failure Modes

| Condition | Runtime response |
| --- | --- |
| GhostCrab unavailable | Ask for `gcp brain up`; continue CrewAI only if the user accepts losing durable shared memory. |
| Empty pack | First run; proceed with empty context and write first useful facts. |
| Workspace absent | Create after `ghostcrab_workspace_list`, before first write. |
| Concurrent writes | Current state uses `ghostcrab_upsert`; durable findings use `ghostcrab_remember` so each agent keeps its evidence. |
| Search miss between agents | Retry broader query and check facets; do not assume another agent failed. |
| Missing schema | Keep writing with clear facets; schema inspection is a later hardening step. |
