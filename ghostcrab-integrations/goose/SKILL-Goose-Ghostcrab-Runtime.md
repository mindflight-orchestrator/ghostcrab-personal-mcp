# Goose GhostCrab Runtime Skill

**Process name:** `goose-ghostcrab-runtime`

Use this skill when the user wants to generate or operate a Goose recipe that uses GhostCrab Personal as shared structured memory for a project.

The runtime assumes GhostCrab Personal is exposed to Goose as a local MCP stdio extension. Goose orchestrates the agents. GhostCrab persists shared state, durable reports, compact recovery context, and graph relations.

**Mode:** `goose run <recipe>.yaml` - autonomous recipe execution. Draft and configure the recipe interactively first, then run it as a Goose recipe.

## Prerequisites

Before using this runtime flow:

1. GhostCrab Personal is reachable through MCP.
2. `ghostcrab_status` succeeds.
3. A Goose project name is known.
4. A GhostCrab workspace either exists or the user has confirmed that one should be created.

Do not require PostgreSQL, Docker, direct database imports, or a remote MCP endpoint for this runtime.

## Validation State

Start every response with one state label:

- `[diagnostic]` - GhostCrab MCP is not reachable, or Goose cannot see the extension
- `[provisional]` - Runtime design or recipe draft exists but has not been validated
- `[MCP-validated]` - A live `ghostcrab_*` call succeeded in this session

Never claim `[MCP-validated]` without a live GhostCrab tool call.

## Runtime Shape

The runtime has five jobs:

1. Recover project context at session start.
2. Dispatch Goose work with compact context, not a full graph dump.
3. Persist durable agent outputs.
4. Update mutable task and run state.
5. Leave a checkpoint so the next Goose session can resume.

## Phase R0 - Preflight

Run this before creating or running a recipe.

1. Call `ghostcrab_status`.
2. Call `ghostcrab_pack` with the current project name and, if known, `workspace_id`.
3. If the pack is empty, treat it as a first run.
4. If the workspace is unknown, search for prior project checkpoints with `ghostcrab_search`.
5. If no workspace can be recovered, ask whether to create one with `ghostcrab_workspace_create`.

If `ghostcrab_status` fails, stop the GhostCrab-dependent workflow and stay in `[diagnostic]`.

## Phase R1 - Map Goose Work to GhostCrab Records

Ask only what is needed to generate a useful runtime recipe:

1. What Goose agent roles will run?
2. What does a completed task need to report?
3. Which task statuses should be tracked?
4. Which dependencies or blockers matter?
5. Which artifacts should be persisted as file paths or URLs?

Recommended records:

| Record | Mutable? | Tool | Purpose |
|---|---|---|---|
| `TASK` | yes | `ghostcrab_upsert` | Current status, assignee, latest summary |
| `AGENT_REPORT` | no | `ghostcrab_remember` | Durable completion report |
| `DECISION` | no | `ghostcrab_remember` | Rationale and committed choice |
| `BLOCKER` | yes | `ghostcrab_upsert` | Current blocker state |
| `RUN_CHECKPOINT` | yes | `ghostcrab_project` | Session handoff and recovery |

Recommended relation labels through `ghostcrab_learn`:

- `DEPENDS_ON`
- `BLOCKS`
- `REPORTS_ON`
- `GOVERNS`
- `HANDOFF_TO`

## Phase R2 - Generate the Goose Recipe

Goose recipes use this schema:

- `version`
- `title`
- `description`
- `instructions` or `prompt`
- optional `parameters`
- optional `extensions`

Use `extensions` as an array. Do not use `enabled` or `envs` in the recipe.

Minimal extension block:

```yaml
extensions:
  - type: stdio
    name: ghostcrab-personal
    cmd: gcp
    args:
      - brain
      - up
    timeout: 120
    description: "GhostCrab Personal local SQLite memory through MCP"
    available_tools:
      - ghostcrab_status
      - ghostcrab_pack
      - ghostcrab_remember
      - ghostcrab_search
      - ghostcrab_upsert
      - ghostcrab_count
      - ghostcrab_learn
      - ghostcrab_project
```

The recipe instructions must include:

1. Startup sequence.
2. Remember vs upsert rules.
3. Reporting contract.
4. Blocker handling.
5. End-of-session checkpoint.
6. Failure modes.

## Personal Seeding Volume

For GhostCrab Personal SQLite, small sequential writes through `ghostcrab_remember` and `ghostcrab_upsert` are acceptable for first-contact demos and light project seeding. Keep community examples around 50 records or fewer. For larger imports, split the seed into smaller runs or use a dedicated importer. Do not prescribe direct database import or external DSN setup for Personal.

For larger PRO deployments, direct database ingestion can be documented as an advanced path after the local recipe works.

## Phase R3 - Reporting Contract

Every Goose agent or delegated sub-agent must leave a report when it completes meaningful work.

### Durable report

Use `ghostcrab_remember` for immutable reports:

```json
{
  "schema_id": "goose:agent_report",
  "content": "Agent <agent_id> completed task <task_id>: <summary>",
  "facets": {
    "record_id": "goose:<project>:report:<run_id>",
    "project": "<project>",
    "workspace_id": "<workspace_id>",
    "agent_id": "<agent_id>",
    "run_id": "<run_id>",
    "task_id": "<task_id>",
    "status": "DONE|BLOCKED|PARTIAL",
    "kind": "agent_report"
  }
}
```

### Mutable task state

Use `ghostcrab_upsert` for current task status:

```json
{
  "schema_id": "goose:task_state",
  "match": {
    "facets": {
      "record_id": "goose:<project>:task:<task_id>"
    }
  },
  "create_if_missing": true,
  "set_content": "Task <task_id> is <status>: <latest_summary>",
  "set_facets": {
    "record_id": "goose:<project>:task:<task_id>",
    "project": "<project>",
    "workspace_id": "<workspace_id>",
    "task_id": "<task_id>",
    "assignee_agent": "<agent_id>",
    "status": "OPEN|IN_PROGRESS|BLOCKED|DONE|PARTIAL",
    "latest_run_id": "<run_id>"
  }
}
```

### Relations

Use `ghostcrab_learn` for dependencies and handoffs:

```json
{
  "edge": {
    "source": "goose:<project>:task:<task_id>",
    "target": "goose:<project>:report:<run_id>",
    "label": "REPORTS_ON",
    "properties": {
      "project": "<project>",
      "workspace_id": "<workspace_id>"
    }
  }
}
```

## Phase R4 - Blockers and Recovery

When a Goose agent is blocked:

1. Use `ghostcrab_upsert` to create or update a `BLOCKER` current-state record.
2. Use `ghostcrab_upsert` to set the task status to `BLOCKED`.
3. Use `ghostcrab_learn` to connect the blocker to the task.
4. Use `ghostcrab_project` to leave an escalation checkpoint.

At the start of the next session:

1. `ghostcrab_status`
2. `ghostcrab_pack` for the project
3. `ghostcrab_search` for open blockers if the pack mentions any

Do not dump the full project graph into Goose context. Use compact packs and targeted searches.

## JTBD Lifecycle for Goose Agents

| Moment | Goose agent question | GhostCrab tool |
|---|---|---|
| Before | What context should I start with? | `ghostcrab_status`, `ghostcrab_pack` |
| Read | What facts or states do I need now? | `ghostcrab_search`, `ghostcrab_count` |
| Write durable | What did I learn that should remain true? | `ghostcrab_remember` |
| Write current | What state changed? | `ghostcrab_upsert` |
| Relate | What depends on or blocks what? | `ghostcrab_learn` |
| After | What should the next session know? | `ghostcrab_project` |
| Recovery | How do I resume after interruption? | `ghostcrab_pack` |

## Failure Modes

| Situation | Runtime behavior |
|---|---|
| GhostCrab unavailable | Stop persistence-dependent steps and ask user to run `gcp brain up` or fix Goose extension config |
| Goose extension not loaded | Tell user to run `goose configure` or use a recipe that declares `ghostcrab-personal` |
| Empty pack | Continue as first run; write only confirmed facts |
| Workspace absent | Ask for confirmation, then create one with `ghostcrab_workspace_create` |
| Schema absent | Use general `goose:*` schema IDs first; advanced schema registration is optional |
| Report write fails | Continue the Goose task if safe, but mark persistence incomplete |
| Mutable state conflict | Use stable `record_id` facets and `ghostcrab_upsert`; do not append duplicate task states |

## First Contact Recipe

For community demos, start with `goose_ghostcrab_personal_recipe.yaml`. It exposes a small tool set and asks Goose to:

1. Call `ghostcrab_status`.
2. Load project context with `ghostcrab_pack`.
3. Store one durable report with `ghostcrab_remember`.
4. Search the saved context with `ghostcrab_search`.

Only move to full task orchestration after that path works.

## Search Mode Note

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. Goose recipes do not need to change when embeddings are enabled on the server.

## Hard Rules

- Goose orchestrates agents; GhostCrab stores shared state.
- GhostCrab Personal SQLite is the default community path.
- Do not require PostgreSQL or MindBrain PRO for the first trial.
- Do not update task state with `ghostcrab_remember`; use `ghostcrab_upsert`.
- Do not invent private APIs; use public `ghostcrab_*` tools.
- Do not pass full graph dumps to sub-agents.
- Use stable `record_id` facets for every mutable record.
- Leave a `ghostcrab_project` checkpoint at the end of orchestration sessions.
