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

Those commands write the client config with the most reliable local command form available from the current directory. If a specific client is not supported yet, use [universal-mcp-client.md](universal-mcp-client.md) and add a new adapter guide.

## Common environment

```json
{
  "GHOSTCRAB_DATABASE_KIND": "sqlite",
  "GHOSTCRAB_EMBEDDINGS_MODE": "disabled",
  "GHOSTCRAB_SQLITE_PATH": "/absolute/path/to/ghostcrab.sqlite"
}
```

Only set `GHOSTCRAB_SQLITE_PATH` when you need a stable database location. Otherwise GhostCrab uses its default data path for the process working directory.

## Verify

Run the process manually first:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

The command is expected to stay running because it is an MCP stdio server. Stop it with `Ctrl+C` after confirming it starts without immediate errors.

Then open the target client and check its MCP server/tool list. The server name should be `ghostcrab` or `ghostcrab-personal-mcp`, depending on the config you used.
