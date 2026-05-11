# Goose GhostCrab Architect - Codex Skill

**Trigger:** Use this skill when the user asks Codex to prepare GhostCrab Personal for a Goose project, create a workspace for Goose agents, design shared memory for Goose recipes, or bootstrap a local ontology for Goose orchestration.

## What This Skill Does

This skill helps Codex prepare a GhostCrab Personal workspace that Goose can use through MCP.

It focuses on:

- checking that GhostCrab Personal is reachable
- understanding the Goose project before modeling it
- creating or recovering a workspace
- deciding what Goose should write as durable facts, mutable state, and graph relations
- handing a clean `workspace_id` and reporting contract to a Goose recipe

**Mode:** `goose session` - interactive onboarding. Use this skill while designing and confirming the workspace before autonomous recipe execution.

## Validation State

Start every response with one state label:

- `[diagnostic]` - GhostCrab MCP is not confirmed reachable
- `[provisional]` - Design is discussed but not yet written or validated
- `[MCP-validated]` - A live `ghostcrab_*` call succeeded in this session

Never claim `[MCP-validated]` without a live tool call in this session.

## Phase A - Sanity Check

Default to this phase unless the user has already confirmed GhostCrab tools are exposed.

1. Call `ghostcrab_status`.
2. Call `ghostcrab_pack` for the current Goose project or repository.
3. If the pack is empty, continue as a first run.
4. If GhostCrab is unavailable, stay in `[diagnostic]` and tell the user to configure GhostCrab Personal:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Do not require PostgreSQL, Docker, direct database imports, migrations, or a remote MCP server for a Personal trial.

## Phase B - Ask Before Modeling

Ask concise questions one at a time:

1. What will Goose agents do in this project?
2. What information should survive between Goose sessions?
3. What should agents be able to retrieve later?
4. Which records are mutable task or run state?
5. Should all Goose agents share one workspace?

Do not infer ontology boundaries from folders alone. Folders are hints, not schema definitions.

End onboarding with:

```text
Probable workspace: <name> - <one-line benefit>. I can create or recover it once you confirm.
```

## Phase C - Workspace Setup

Use one GhostCrab workspace per Goose project.

Sequence:

1. `ghostcrab_pack` to recover prior context.
2. `ghostcrab_workspace_create` for a new project.
3. `ghostcrab_project` to checkpoint the setup.

If the user is only exploring, keep the workspace proposal provisional and do not write.

## Phase D - Minimal Memory Model

Start with the public `ghostcrab_*` tools Goose will actually call.

| Need | Tool | Rule |
|---|---|---|
| Health check | `ghostcrab_status` | First call in every recipe |
| Recovery context | `ghostcrab_pack` | Use before broad search |
| Durable observation | `ghostcrab_remember` | Append-style facts and reports |
| Current state | `ghostcrab_upsert` | Tasks, blockers, run status |
| Lookup | `ghostcrab_search` | Query facts by text and facets |
| Relation | `ghostcrab_learn` | Dependencies, blockers, handoffs |
| Handoff | `ghostcrab_project` | End-of-session checkpoint |

### Remember vs Upsert

Use `ghostcrab_remember` when history matters and old records should remain true. Examples: a Goose agent report, a decision rationale, a research finding.

Use `ghostcrab_upsert` when there should be one latest record. Examples: current task status, current blocker state, active milestone summary.

## First Contact Path

For a community demo, use no more than four tools:

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_remember`
4. `ghostcrab_search`

This is enough to prove Goose can connect, recover context, write a fact, and retrieve it.

## Handoff to Goose Runtime

When the architect phase is complete, provide:

- `workspace_id`
- `project_name`
- known Goose agent roles
- mutable records that require `ghostcrab_upsert`
- durable records that require `ghostcrab_remember`
- dependency labels that require `ghostcrab_learn`

Use stable record IDs:

```text
goose:<project-slug>:task:<task-id>
goose:<project-slug>:run:<run-id>
goose:<project-slug>:agent:<agent-name>
```

## Personal Ingestion Volume

For GhostCrab Personal SQLite, small sequential writes through `ghostcrab_remember` are acceptable for first contact and light workspace setup. Keep initial community seeding around 50 records or fewer. For larger imports, split the seed into smaller sessions or use a dedicated importer; do not make direct database import or external DSN setup part of the Personal path.

For larger PRO deployments, direct database ingestion can be documented separately as an advanced path.

## Failure Modes

| Situation | Action |
|---|---|
| GhostCrab unavailable | Stay `[diagnostic]`; do not design or write |
| Empty pack | Treat as first run; ask for the project summary |
| Workspace missing | Create only after confirmation |
| Schema missing | Use general records first; schema is an advanced follow-up |
| Goose extension not loaded | Tell the user to run `goose configure` or use a recipe declaring the stdio extension |
| Write failed | Report that persistence failed and continue without pretending state was saved |

## Hard Rules

- GhostCrab Personal SQLite is the default community path.
- Do not present PostgreSQL or MindBrain PRO as required.
- Do not register schemas before the user's real retrieval jobs are clear.
- Do not use private or invented tool names.
- Do not update current state with `ghostcrab_remember`; use `ghostcrab_upsert`.
- Do not give Goose the full graph when a compact `ghostcrab_pack` is enough.
