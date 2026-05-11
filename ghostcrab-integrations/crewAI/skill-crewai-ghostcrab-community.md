# Skill: CrewAI GhostCrab Community Quickstart

## Purpose

Use this skill for a first 30-minute CrewAI + GhostCrab Personal trial.

It is intentionally small: one local workspace, SQLite, MCP `stdio`, and four tools after setup.

## Setup

Start GhostCrab Personal:

```bash
gcp brain up
```

Then call:

```text
ghostcrab_status
ghostcrab_workspace_list
ghostcrab_workspace_create   # only if the workspace is absent
```

## Python Integration

For a small CrewAI prototype, start with `ghostcrab-integrations/crewAI/ghostcrab-crewai/`.
The recommended entry point is Path B: use `MCPServerAdapter` with
`ghostcrab_stdio_server_params()` so agents receive the local `ghostcrab_*`
tools through MCP stdio.

## First Contact Sequence

Use exactly this path:

```text
ghostcrab_pack -> ghostcrab_remember -> ghostcrab_search -> ghostcrab_upsert
```

Scenario:

1. A researcher agent starts with `ghostcrab_pack`.
2. It stores one durable research finding with `ghostcrab_remember`.
3. A writer agent retrieves the finding with `ghostcrab_search`.
4. The coordinator updates the current report/task state with `ghostcrab_upsert`.

## What GhostCrab Replaces

| CrewAI memory type | Keep or replace? |
| --- | --- |
| Long-term memory | Use `ghostcrab_remember` for durable facts across runs. |
| Entity memory | Use `ghostcrab_upsert` for current entity state. |
| Short-term memory | Keep in CrewAI. |
| Contextual memory | Keep in CrewAI. |

## Minimal Rule

If it should be remembered as evidence, use `ghostcrab_remember`.

If it is the latest state of a named thing, use `ghostcrab_upsert`.

## Agent Performance Contract

1. Let CrewAI keep short-term and contextual memory inside the run; use GhostCrab only for cross-run facts, entities, task state, and handoffs.
2. Call `ghostcrab_pack` before the crew starts work so agents inherit shared context without stuffing old transcripts into prompts.
3. Use `ghostcrab_remember` for durable agent findings and `ghostcrab_upsert` for current entity or task state.
4. Add `crew_id`, `agent_id`, `task_id`, and `record_id` facets whenever possible. These facets make later crew runs searchable and mergeable.
5. At crew completion, write one `ghostcrab_project` handoff with the next recommended crew action.

## Failure Modes

| Condition | Response |
| --- | --- |
| Pack is empty | First run; continue and write the first finding. |
| Workspace is absent | Create it before the first write. |
| Search misses | Try a broader query and check facets. |
| GhostCrab is unavailable | Start `gcp brain up` and retry. |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. CrewAI crews keep the same search call; Personal returns keyword matches by default, while configured deployments improve retrieval automatically.
