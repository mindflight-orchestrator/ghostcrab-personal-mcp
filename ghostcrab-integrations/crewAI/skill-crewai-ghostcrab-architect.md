# Skill: CrewAI GhostCrab Architect

## Purpose

Use this skill to bootstrap a CrewAI workspace in GhostCrab Personal and let the schema emerge from real crew usage.

The first step is not schema design. The first step is a provisional workspace with a few well-faceted records.

Default target:

- `@mindflight/ghostcrab-personal-mcp`
- `gcp brain up`
- local SQLite
- MCP `stdio`
- public `ghostcrab_*` tools

## Bootstrap Sequence

1. Start GhostCrab Personal:

```bash
gcp brain up
```

2. Call `ghostcrab_status`.
3. Call `ghostcrab_workspace_list`.
4. If absent, call `ghostcrab_workspace_create`.
5. Create the first project and task state with `ghostcrab_upsert`.
6. Store durable seed facts with `ghostcrab_remember`.
7. Add relations with `ghostcrab_learn` only when they are known.

## Provisional Workspace Pattern

Use a workspace per crew or product surface:

```text
crewai-<project-slug>
```

Recommended initial facets:

```json
{
  "source": "crewai",
  "crew_id": "<crew-id>",
  "agent_id": "<agent-id>",
  "task_id": "<task-id>",
  "kind": "finding|task|entity|decision|handoff",
  "status": "planned|in_progress|blocked|done"
}
```

## Schema Emergence

Do not ask the user to define node types and relation types before the first run.

Instead:

1. Run one or two CrewAI tasks.
2. Use `ghostcrab_remember` for durable findings.
3. Use `ghostcrab_upsert` for current tasks and entities.
4. Use `ghostcrab_count` to discover repeated `kind`, `status`, `agent_id`, or `task_id` patterns.
5. Use `ghostcrab_schema_list` and `ghostcrab_schema_inspect` after patterns stabilize.
6. Export the model with `ghostcrab_workspace_export_model` only when another tool needs a contract.

## CrewAI Memory Mapping

| CrewAI memory type | Architect decision |
| --- | --- |
| Long-term memory | Represent as durable `ghostcrab_remember` records. |
| Entity memory | Represent as mutable `ghostcrab_upsert` records with stable `record_id`. |
| Short-term memory | Leave in CrewAI. |
| Contextual memory | Leave in CrewAI. |

## Lifecycle JTBD

| Moment | Architect question | Tool |
| --- | --- | --- |
| Before | Does the workspace exist and what context is available? | `ghostcrab_workspace_list`, `ghostcrab_pack` |
| Read | What facts/entities already exist? | `ghostcrab_search`, `ghostcrab_count` |
| Write | Is this durable or current state? | `ghostcrab_remember` or `ghostcrab_upsert` |
| After | What should crews inherit next run? | `ghostcrab_project` |
| Recovery | What bootstrap state should be resumed? | `ghostcrab_pack` |

## Starter Records

Use `ghostcrab_upsert` for:

- project root
- crew run state
- task state
- entity state
- active blocker state

Use `ghostcrab_remember` for:

- validated research
- accepted decision
- final task result
- user preference that should survive runs
- review or audit finding

Use `ghostcrab_learn` for:

- task depends on task
- finding informs decision
- blocker blocks task
- report uses finding
- agent owns task

## Failure Modes

| Condition | Response |
| --- | --- |
| `ghostcrab_status` fails | Ask the user to start `gcp brain up`; do not simulate persistence. |
| Workspace missing | Create it only after `ghostcrab_workspace_list` confirms absence. |
| Pack empty | Normal first run; seed the first facts and project heartbeat. |
| No schema | Continue with well-named facets; inspect later. |
| Concurrent agents write the same entity | Use stable `record_id` upserts for current state and separate remembered facts for evidence. |

## Later PRO Path

If the crew outgrows local Personal SQLite, mention PostgreSQL only as a short PRO deployment option. Keep the community default local-first.
