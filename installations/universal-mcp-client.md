# Universal MCP client adapter

Use this guide for any agent client that supports local MCP servers over stdio.

## Decision checklist

1. Find where the client stores MCP server definitions.
2. Confirm the config accepts a command and an argument array.
3. Prefer a local absolute `node` command if the client has a limited `PATH`.
4. Use `npx --package=` only when a local install is not practical.
5. Set a fixed working directory or `GHOSTCRAB_SQLITE_PATH` if the client's launch directory is unclear.

## Generic JSON shape

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@mindflight/ghostcrab-personal-mcp@latest",
        "gcp",
        "brain",
        "up"
      ],
      "env": {
        "GHOSTCRAB_DATABASE_KIND": "sqlite",
        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"
      }
    }
  }
}
```

## More reliable local form

After installing the package in a project:

```bash
npm install @mindflight/ghostcrab-personal-mcp
realpath node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs
```

Use the resolved path:

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "node",
      "args": [
        "/absolute/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs",
        "brain",
        "up"
      ]
    }
  }
}
```

## Client config mapping

| Generic field | Typical client-specific names                       |
| ------------- | --------------------------------------------------- |
| `mcpServers`  | `mcpServers`, `mcp.servers`, `servers`, `tools.mcp` |
| `command`     | `command`, `cmd`, `executable`, `commandOrUrl`      |
| `args`        | `args`, `arguments`, trailing CLI args              |
| `env`         | `env`, `environment`, `env_vars`                    |
| `cwd`         | `cwd`, `workingDirectory`, `workdir`                |

If the client has an allowlist or trust flag, enable GhostCrab explicitly after adding the server.

## Validation prompt

After connecting, ask the agent:

```text
List the available GhostCrab MCP tools and call the status or project guidance tool if available.
```

If no tools appear, inspect the client MCP logs first. The most common causes are `PATH` mismatch, invalid `npx` scoped-package syntax, or a working directory that cannot create the SQLite data directory.
