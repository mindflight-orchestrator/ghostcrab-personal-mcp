# Goose + GhostCrab Personal SOP

This SOP explains how to connect Goose to GhostCrab Personal so Goose agents can use a local SQLite-backed knowledge graph through MCP tools.

The community path is local-first:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Startup command: `gcp brain up`
- Storage: SQLite managed by GhostCrab Personal
- Transport: local MCP `stdio`
- Public tools: `ghostcrab_*`

Do not require PostgreSQL, Docker, migrations, or a remote MCP endpoint for the first trial.

## Target Fit

Goose is an MCP-capable agent runtime. GhostCrab Personal is an MCP server. The clean integration is direct: Goose loads GhostCrab as a command-line MCP extension, then its agents call `ghostcrab_status`, `ghostcrab_pack`, `ghostcrab_remember`, `ghostcrab_search`, and related tools.

The division of responsibility is simple:

| Layer | Responsibility |
|---|---|
| Goose | Agent reasoning, recipes, sub-agent orchestration, user interaction |
| GhostCrab Personal MCP | Local tools for structured memory, search, project context, and graph relations |
| SQLite | Durable local storage owned by GhostCrab Personal |

## Start Here

Use this first-contact path before designing schemas or orchestrators.

Use `goose session` for interactive onboarding, questions, and workspace setup. Use `goose run <recipe>.yaml` when the recipe is already configured and should execute autonomously. The examples below show both the extension setup and a reusable recipe shape.

1. Install and start GhostCrab Personal.

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

2. Add GhostCrab to Goose as a command-line MCP extension.

Use Goose Desktop or CLI:

```bash
goose configure
```

Choose `Add Extension`, then `Command-line Extension`, and configure:

| Field | Value |
|---|---|
| Name | `ghostcrab-personal` |
| Type | `stdio` |
| Command | `gcp` |
| Arguments | `brain`, `up` |
| Timeout | `120` |

For a reusable Goose recipe, declare the extension in the recipe:

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
      - ghostcrab_project
```

3. Verify the extension inside Goose.

Ask Goose to run:

```text
Call ghostcrab_status. If GhostCrab is available, create a one-line readiness summary.
```

4. Try the minimal memory loop.

```text
Use ghostcrab_pack to recover any existing context for this project.
Then use ghostcrab_remember to store one durable project observation.
Then use ghostcrab_search to find it again.
```

This uses four tools or fewer and proves that Goose can read and write GhostCrab state.

## Tool Mapping

| Goose need | GhostCrab tool |
|---|---|
| Check the extension is alive | `ghostcrab_status` |
| Load compact project context | `ghostcrab_pack` |
| Store a durable fact or report | `ghostcrab_remember` |
| Update current task or run state | `ghostcrab_upsert` |
| Search saved facts | `ghostcrab_search` |
| Count items for a status view | `ghostcrab_count` |
| Save dependencies, blockers, or handoffs | `ghostcrab_learn` |
| Leave a session checkpoint | `ghostcrab_project` |
| Create project isolation | `ghostcrab_workspace_create` |

## Write Model

GhostCrab has two different write paths. Goose recipes must keep them separate.

Use `ghostcrab_remember` for append-style durable observations:

- agent reports
- decisions
- research findings
- user preferences
- audit notes

Use `ghostcrab_upsert` for mutable current state:

- task status
- active run metadata
- latest blocker state
- current milestone progress
- per-agent heartbeat records

Use `ghostcrab_learn` for graph relations:

- `TASK depends_on TASK`
- `TASK blocked_by BLOCKER`
- `REPORT describes TASK`
- `DECISION governs TASK`

## Goose Recipe Shape

Goose recipes are YAML files with `version`, `title`, `description`, `instructions` or `prompt`, optional `parameters`, and optional `extensions`.

Use this shape, not a Goose config file shape:

```yaml
version: "1.0.0"
title: "GhostCrab Project Memory"
description: "Use GhostCrab Personal as local structured memory for a Goose project."
instructions: |
  You are a Goose agent with GhostCrab Personal available through MCP.
  Start by calling ghostcrab_status, then ghostcrab_pack for the project.
parameters:
  - key: project_name
    input_type: string
    requirement: required
    description: "Project name used in GhostCrab facets and summaries"
extensions:
  - type: stdio
    name: ghostcrab-personal
    cmd: gcp
    args:
      - brain
      - up
    timeout: 120
    description: "GhostCrab Personal local SQLite memory through MCP"
```

Avoid recipe fields such as `enabled` or `envs`; those belong to other extension configuration contexts, not the portable Goose recipe schema.

## Failure Modes

| Situation | Expected Goose behavior |
|---|---|
| `ghostcrab_status` fails | Stop the GhostCrab-dependent flow and ask the user to start `gcp brain up` or reconfigure the extension |
| `ghostcrab_pack` returns empty context | Treat it as a first run, continue with a small project summary, and write only confirmed facts |
| Workspace does not exist | Ask whether to create one, then use `ghostcrab_workspace_create` if the user confirms or the recipe parameter requires it |
| Schema is missing | Continue with general facets first; only inspect or register schemas in an advanced architect flow |
| Goose cannot see the extension | Re-run `goose configure` or use a recipe with the `ghostcrab-personal` stdio extension declared |
| Write fails mid-run | Continue the Goose task if possible, but tell the user that GhostCrab persistence did not complete |

## Search Mode Note

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in the GhostCrab server environment or config. Goose recipes can keep the same `ghostcrab_search` call; retrieval quality follows the active GhostCrab server mode.

## Community Demo Scenario

Ask Goose:

```text
Use GhostCrab Personal to remember that Project Atlas needs a deployment checklist.
Then search GhostCrab for Project Atlas and summarize what is known.
```

Expected tool sequence:

1. `ghostcrab_status`
2. `ghostcrab_pack`
3. `ghostcrab_remember`
4. `ghostcrab_search`

This is the recommended first demo because it proves connectivity, recovery context, durable write, and retrieval without asking the user to design an ontology first.

## Later Path

For larger deployments, teams may move from the local Personal path to a managed or PRO deployment with stronger indexing, shared infrastructure, and richer operational controls. Keep that as a later path. It should not be required for a Goose community trial.
