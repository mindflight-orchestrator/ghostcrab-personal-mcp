# GhostCrab MCP in Gemini CLI

Gemini CLI supports MCP servers through `settings.json` using a top-level `mcpServers` object. It also provides `gemini mcp add` commands for managing entries.

Reference: <https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html>

## `settings.json`

Add GhostCrab to the user or project Gemini settings file:

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
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

If you want the database tied to a known project directory, add `cwd` or set `GHOSTCRAB_SQLITE_PATH`:

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "node",
      "args": [
        "/absolute/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs",
        "brain",
        "up",
        "--workspace",
        "my-project"
      ],
      "cwd": "/absolute/path/to/project",
      "env": {
        "GHOSTCRAB_DATABASE_KIND": "sqlite",
        "GHOSTCRAB_SQLITE_PATH": "/absolute/path/to/ghostcrab.sqlite"
      }
    }
  }
}
```

## CLI add form

Gemini CLI documents:

```bash
gemini mcp add [options] <name> <commandOrUrl> [args...]
```

For GhostCrab:

```bash
gemini mcp add ghostcrab npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

If your Gemini CLI supports scopes, choose the appropriate user or project scope for the current install.

## Verify

Start Gemini CLI and inspect its MCP server list or tool discovery output. If tools do not appear, check:

- `mcp.allowed` does not exclude `ghostcrab`.
- The command works from the same shell: `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up`.
- The SQLite path or `cwd` is writable.
