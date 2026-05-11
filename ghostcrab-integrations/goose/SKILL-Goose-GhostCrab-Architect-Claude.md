# Goose GhostCrab Architect - Claude Code Entrypoint

Use this skill when Claude Code is helping a user prepare a GhostCrab Personal workspace that Goose agents will later use through an MCP extension.

The goal is not to force an ontology on the first turn. The goal is to establish a local GhostCrab workspace, understand the user's Goose project, and create enough structured memory for Goose recipes to recover context safely.

**Mode:** `goose session` - interactive onboarding. This skill is for dialogue, clarification, and workspace setup before a recipe is run.

## Validation State

Start every response with one state label:

- `[diagnostic]` - GhostCrab MCP has not been confirmed reachable in this Claude Code session
- `[provisional]` - A workspace or model has been discussed but not confirmed through live tools
- `[MCP-validated]` - A live `ghostcrab_*` tool call succeeded in this session

Never claim `[MCP-validated]` without a successful live GhostCrab tool call.

## Phase A - Verify GhostCrab Personal

Start here unless the user explicitly says GhostCrab is already reachable in this session.

1. Call `ghostcrab_status`.
2. If available, call `ghostcrab_pack` with a short query for the current project.
3. If no context exists, treat that as a valid first run.
4. If tools are unavailable, stay in `[diagnostic]` and tell the user to start or configure GhostCrab Personal with:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Do not require Docker, PostgreSQL, migrations, direct database imports, or a remote MCP endpoint for the Personal path.

## Phase B - Understand the Goose Project

Ask one question at a time. Do not draft schemas before you understand the job.

1. What will Goose agents actually do in this project?
2. Which context should survive across Goose sessions?
3. What are the two or three retrieval jobs that matter most?
4. Which current-state records should Goose update over time?
5. Is one GhostCrab workspace enough, or do separate projects need isolated workspaces?

End onboarding with:

```text
Probable workspace: <workspace-id-or-name> - <one-line benefit>. Ready to create it once you confirm.
```

## Phase C - Create or Recover Workspace

Use a workspace per Goose project, not per agent run.

Preferred sequence:

1. `ghostcrab_pack` to recover any prior workspace notes.
2. `ghostcrab_workspace_create` if this is a new project.
3. `ghostcrab_project` to leave a setup checkpoint.

If a workspace already exists, use it. Do not create a second workspace for the same Goose project unless the user explicitly asks for isolation.

## Phase D - Model Only What Goose Needs

Start with lightweight records before schema-heavy design.

Use `ghostcrab_remember` for durable facts:

- project purpose
- accepted decisions
- agent role descriptions
- important user preferences

Use `ghostcrab_upsert` for current state:

- active milestone
- current task status
- latest agent run summary
- blocker state

Use `ghostcrab_learn` for relations:

- task dependencies
- blocker links
- role ownership
- decision-to-task links

Only inspect or register schemas after the user confirms that stable structure is needed. If schemas are used, derive field names from real project artifacts and confirmed Goose reporting needs.

## Personal Ingestion Volume

For GhostCrab Personal SQLite, small sequential writes through `ghostcrab_remember` are acceptable for first contact and light setup. As a practical community guideline, keep initial seeding around 50 records or fewer. For larger imports, split the work into smaller sessions or use a purpose-built importer; do not present direct database import or external DSN setup as part of the Personal path.

For larger PRO deployments, direct database ingestion may be available as an advanced path.

## Goose Handoff

When the workspace is ready, provide Goose with:

- `workspace_id`
- project name
- expected agent roles
- stable `record_id` convention
- the minimal tool set needed by the recipe

Recommended `record_id` format:

```text
goose:<project-slug>:task:<task-id>
goose:<project-slug>:agent:<agent-name>
goose:<project-slug>:report:<run-id>
```

## First Contact Tool Set

Keep the first community path to four tools or fewer:

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_remember`
4. `ghostcrab_search`

Add `ghostcrab_workspace_create`, `ghostcrab_upsert`, `ghostcrab_learn`, and `ghostcrab_project` only when the user moves from first contact to project setup.

## Failure Modes

| Situation | Response |
|---|---|
| GhostCrab tools are missing | Stay `[diagnostic]`; ask the user to configure the Goose/Codex/Claude MCP extension |
| `ghostcrab_pack` is empty | Treat as first run; do not invent prior context |
| Workspace is unknown | Search for prior checkpoints; if none exist, ask to create a workspace |
| Schema is missing | Continue with general records; schema work is optional and advanced |
| Write fails | Continue the conversation but clearly mark persistence as incomplete |

## Hard Rules

- Do not propose PostgreSQL as the default path.
- Do not freeze schemas on a vague first turn.
- Do not use `ghostcrab_remember` to update mutable task state; use `ghostcrab_upsert`.
- Do not pass a full graph dump to Goose; use `ghostcrab_pack`.
- End setup phases with a `ghostcrab_project` checkpoint when the tool is available.
