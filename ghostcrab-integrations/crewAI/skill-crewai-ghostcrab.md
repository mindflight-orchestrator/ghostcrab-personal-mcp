# Skill: CrewAI GhostCrab Personal

## Purpose

Use this skill when a CrewAI project wants shared durable memory through GhostCrab Personal without building a custom package first.

Default integration target:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Start command: `gcp brain up`
- Storage: local SQLite
- MCP transport: local `stdio` by default
- Tools: public `ghostcrab_*` MCP tools

This skill is MCP-first. A Python package can come later, after the team has validated the memory pattern.

## Start Here

1. Start GhostCrab Personal:

```bash
gcp brain up
```

2. From the CrewAI host or MCP-capable agent, call `ghostcrab_status`.
3. Call `ghostcrab_workspace_list`.
4. If the workspace is absent, call `ghostcrab_workspace_create`.

Workspace creation must happen before the first `ghostcrab_remember` or `ghostcrab_upsert`.

## CrewAI Memory Mapping

| CrewAI memory type | GhostCrab mapping | Rule |
| --- | --- | --- |
| Long-term memory | `ghostcrab_remember` | Durable findings, decisions, task outcomes, and user/project facts across runs. |
| Entity memory | `ghostcrab_upsert` | Current state of tracked entities such as customer, task, report, topic, or artifact. |
| Short-term memory | Keep in CrewAI | Intra-run scratch context. Do not persist every transient thought. |
| Contextual memory | Keep in CrewAI | Prompt assembly and local context window remain CrewAI responsibilities. |

GhostCrab complements CrewAI memory; it does not replace CrewAI's short-term reasoning loop.

## Write Model

| Question | Tool |
| --- | --- |
| Is this a durable observation that should survive future runs? | `ghostcrab_remember` |
| Is this the latest state of a named entity or task? | `ghostcrab_upsert` |
| Is this a dependency, blocker, ownership, or evidence link? | `ghostcrab_learn` |
| Do I need a recovery briefing at the start of a run? | `ghostcrab_pack` |

Use stable `record_id` facets for upserts, for example:

```text
crewai:task:<task-id>
crewai:agent:<agent-id>
crewai:entity:<entity-slug>
crewai:report:<report-id>
```

## Lifecycle JTBD

| Moment | CrewAI agent question | GhostCrab tool |
| --- | --- | --- |
| Before | What should this crew remember before starting? | `ghostcrab_pack` |
| Read | What prior facts or entities matter now? | `ghostcrab_search` |
| Write | Is this durable memory or current entity state? | `ghostcrab_remember` or `ghostcrab_upsert` |
| After | What handoff should future runs see first? | `ghostcrab_project` |
| Recovery | How do we resume after interruption? | `ghostcrab_pack` |

## Recommended Agent Contract

Each CrewAI task should leave a small, structured GhostCrab trace:

1. At task start, call `ghostcrab_pack` with the task goal and workspace.
2. During work, call `ghostcrab_search` only for needed prior context.
3. For durable findings, call `ghostcrab_remember`.
4. For current task/entity status, call `ghostcrab_upsert`.
5. For handoffs, call `ghostcrab_project`.

## Example Patterns

### Researcher

- Reads: `ghostcrab_pack`, `ghostcrab_search`
- Writes: `ghostcrab_remember` for findings, `ghostcrab_upsert` for task status

### Analyst

- Reads: `ghostcrab_search` for prior findings
- Writes: `ghostcrab_remember` for decisions and rationale

### Writer

- Reads: `ghostcrab_pack` for source material
- Writes: `ghostcrab_upsert` for draft status and `ghostcrab_remember` for final conclusions

### Manager / Coordinator

- Reads: `ghostcrab_count` and `ghostcrab_pack`
- Writes: `ghostcrab_upsert` for current task state and `ghostcrab_project` for handoff summaries

## Failure Modes

| Condition | Response |
| --- | --- |
| `ghostcrab_status` unavailable | Ask the user to run `gcp brain up`; pause GhostCrab writes. |
| Workspace missing | Call `ghostcrab_workspace_list`, then `ghostcrab_workspace_create`. |
| `ghostcrab_pack` empty | Treat as first run; continue with empty context and write the first durable facts. |
| `ghostcrab_search` returns empty after another agent wrote | Treat as possible timing or facet mismatch; retry with broader query before concluding absence. |
| Concurrent agents update the same entity | Use `ghostcrab_upsert` with stable `record_id`; keep durable findings in separate `ghostcrab_remember` records. |
| Schema type missing | Do not block first use. Write with clear facets and inspect schema later. |

## Later PRO Path

For larger multi-team deployments, a PostgreSQL-backed PRO path may be useful. It is not required for the local CrewAI community trial.

