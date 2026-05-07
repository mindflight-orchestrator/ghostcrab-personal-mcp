# GhostCrab MCP in OpenFang-style agents

Use this guide for OpenFang local agent wrappers or runtimes that can launch MCP servers. There is no single verified OpenFang MCP config path in this repo, so treat this as an adapter pattern.

## Minimal server config

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
      ]
    }
  }
}
```

## Project-stable config

Use this when OpenFang launches tools from unpredictable directories:

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
        "GHOSTCRAB_SQLITE_PATH": "/absolute/path/to/project/.ghostcrab/ghostcrab.sqlite"
      }
    }
  }
}
```

## Skill or agent notes

If OpenFang has an agent profile, rule file, or skill folder, adapt:

- [templates/universal-ghostcrab-skill/SKILL.md](templates/universal-ghostcrab-skill/SKILL.md)

Keep the skill short. It should tell the agent when to use GhostCrab, how to verify the MCP server exists, and how to avoid writing low-value noise into durable memory.

## Validation

Use the client's MCP diagnostics first. If OpenFang only reports "server failed", run the configured command manually and check for:

- missing Node.js 20+
- bad scoped-package `npx` syntax
- unwritable SQLite path
- client launch directory differing from the project directory
