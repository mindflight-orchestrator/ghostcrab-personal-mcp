# GhostCrab MCP in Nous-Hermes-style agents

Use this guide for Nous-Hermes local agent wrappers or runtimes that can launch MCP servers. There is no single verified Nous-Hermes MCP config path in this repo, so treat this as an adapter pattern.

## MCP server definition

If the runtime accepts an `mcpServers` JSON object, use:

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

If the runtime exposes a UI, map the same values:

- Name: `ghostcrab`
- Transport: `stdio`
- Command: `npx`
- Arguments: `-y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up`
- Environment: set `GHOSTCRAB_DATABASE_KIND=sqlite`; optionally set `GHOSTCRAB_SQLITE_PATH`

## Prompt or system instruction

Pair the MCP config with the universal skill template:

- [templates/universal-ghostcrab-skill/SKILL.md](templates/universal-ghostcrab-skill/SKILL.md)

Adapt the frontmatter and any loader-specific metadata to the Nous-Hermes skill format.

## Validation

Ask the runtime to list MCP tools. Then ask it to create or inspect a GhostCrab workspace before relying on persistent memory.
