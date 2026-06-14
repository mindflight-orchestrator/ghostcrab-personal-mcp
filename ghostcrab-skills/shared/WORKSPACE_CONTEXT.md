# Workspace context (CLI vs MindBrain)

GhostCrab uses **two different workspace concepts**. Agents must not confuse them.

## Two concepts

| Concept | Example | What it selects |
|---------|---------|-----------------|
| **SQLite database** | `--db ~/.ghostcrab/databases/ghostcrab.sqlite` | Which **SQLite file** the MCP process opens |
| **MindBrain workspace_id** | `--workspace my-app`, `default`, `immeuble` | Logical **partition inside** that SQLite file |

`ghostcrab_status` echoes both via `active_workspace_id` and `workspace_context` (pin source, CLI name, sqlite path source).

## Startup pin order

1. `GHOSTCRAB_ACTIVE_WORKSPACE_ID` env (explicit pin) if the id exists in the database
2. Else CLI `--workspace` slug if a matching `workspace_id` exists in the database
3. Else `default` (status may show `pin_status: unresolved` when a requested id was missing)

## Intentional switch (allowed)

When the user asks to work in another MindBrain workspace:

1. `ghostcrab_workspace_list` — see valid `workspace_id` values
2. Tell the user which workspace you are switching to
3. `ghostcrab_workspace_use` with the target `workspace_id`
4. `ghostcrab_status` — verify `active_workspace_id`

## Forbidden (agents)

- Switching workspace because a read returned zero rows
- Switching workspace because a tool errored or the backend was unreachable
- Opening the `.sqlite` file (`sqlite3`, file read tools, `gcp brain document` to read data)
- Running SQL in a shell to inspect GhostCrab data — use MCP tools only

## Writes

Before `ghostcrab_remember`, `ghostcrab_upsert`, or `ghostcrab_learn`, confirm `active_workspace_id` in the latest `ghostcrab_status` matches the user's intent.
