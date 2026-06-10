# `gcp brain setup` and shared GhostCrab setup

Use this page before writing a client-specific guide. It captures the shared GhostCrab side of the installation.

## Requirements

- Node.js 20+
- A package runner: `npm`, `npx`, `pnpm`, or a local project install
- A client that supports MCP over stdio

## Package

```bash
@mindflight/ghostcrab-personal-mcp
```

The package exposes:

```bash
gcp
ghostcrab
```

Use `gcp brain up` for new configs. `ghostcrab` and `gcp serve` exist for compatibility, but new docs should prefer `gcp brain up`.

## Recommended install forms

Local project install:

```bash
npm install @mindflight/ghostcrab-personal-mcp
node ./node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs brain up
```

No local install:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

With a named workspace:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up --workspace my-project
```

Create the workspace once if you want an explicit project name:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain workspace create my-project
```

## Generated setup

Where supported by the CLI, prefer the generator:

```bash
npx gcp brain setup cursor
npx gcp brain setup claude
npx gcp brain setup codex
```

Those commands write the client config with the most reliable local command form available from the current directory. They also apply MCP permission preset **`basic`** by default (13 recommended tools) and install the matching **GhostCrab IDE skill bundle** (10 skills) from `bin/ide-skills/`. Opt out: `--no-permissions`, `--no-skills`. Manage presets: `gcp brain permissions print|apply`. Skill bundles: [bin/ide-skills/README.md](../bin/ide-skills/README.md). If a specific client is not supported yet, use [universal-mcp-client.md](universal-mcp-client.md) and add a new adapter guide.

Codex is not a JSON `mcpServers` client. `gcp brain setup codex` calls `codex mcp add` and the manual fallback is TOML `[mcp_servers.<name>]`, not Cursor-style JSON. If you need a dedicated Codex entry and database file, use:

```bash
npx gcp brain setup codex --force \
  --name "ghostcrab-personal-mcp story2doc" \
  --db /absolute/path/data/ghostcrab-story2doc-codex.sqlite
```

## Common environment

```json
{
  "GHOSTCRAB_DATABASE_KIND": "sqlite",
  "GHOSTCRAB_EMBEDDINGS_MODE": "disabled",
  "GHOSTCRAB_SQLITE_PATH": "/absolute/path/to/ghostcrab.sqlite"
}
```

Only set `GHOSTCRAB_SQLITE_PATH` when you need a stable database location. Otherwise GhostCrab uses its default data path for the process working directory.

Alternatively, pass `--db <path>` directly in the `args` list of the MCP entry instead of using the environment variable:

```json
"args": ["...gcp.mjs", "brain", "up", "--db", "/absolute/path/to/ghostcrab.sqlite"]
```

When both are present, `GHOSTCRAB_SQLITE_PATH` takes precedence over `--db`.

#### MindBrain workspace_id vs CLI workspace

- **`--workspace my-project`** in `args` selects which **SQLite file** to open (CLI config).
- **`GHOSTCRAB_ACTIVE_WORKSPACE_ID`** in `env` pins the **MindBrain workspace_id** inside that file (logical partition, e.g. `default`, `immeuble-demo`).
- Without `GHOSTCRAB_ACTIVE_WORKSPACE_ID`, the server tries the CLI workspace slug as `workspace_id` if it exists in the database, else `default`. Verify via `ghostcrab_status.workspace_context`.

```json
"env": {
  "GHOSTCRAB_ACTIVE_WORKSPACE_ID": "immeuble-demo"
}
```

Setup helper: `gcp brain setup cursor --mindbrain-workspace-id immeuble-demo`

## Verify

Run the process manually first:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

The command is expected to stay running because it is an MCP stdio server. Stop it with `Ctrl+C` after confirming it starts without immediate errors.

Then open the target client and check its MCP server/tool list. The server name should be `ghostcrab` or `ghostcrab-personal-mcp`, depending on the config you used.

For Codex specifically, `codex mcp list` only proves the server is registered. Start a new Codex session and run `/mcp`; tools appear only after Codex starts the MCP stdio process successfully for that active session.
