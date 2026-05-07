# GhostCrab MCP in OpenClaw

OpenClaw has two MCP-related modes:

- `openclaw mcp serve` makes OpenClaw itself available as an MCP server.
- `openclaw mcp list/show/set/unset` manages outbound MCP server definitions that OpenClaw-owned runtimes may consume.

For GhostCrab, you normally want the second path: register GhostCrab as an outbound MCP server.

Reference: <https://docs.openclaw.ai/cli/mcp>

## Register GhostCrab

Use OpenClaw's current `mcp set` syntax for your installed version. The payload should describe a stdio command equivalent to:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

Generic config payload:

```json
{
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
```

Then check:

```bash
openclaw mcp list
openclaw mcp show ghostcrab
```

OpenClaw's registry commands store definitions; they do not necessarily prove the child runtime can start the server. Validate from the runtime profile that consumes the registered MCP server.

## Skills

Use the checked-in OpenClaw skill material:

- [../ghostcrab-skills/openclaw/ghostcrab-memory/SKILL.md](../ghostcrab-skills/openclaw/ghostcrab-memory/SKILL.md)
- [../ghostcrab-skills/openclaw/ghostcrab-epistemic-agent/](../ghostcrab-skills/openclaw/ghostcrab-epistemic-agent/)
- [../ghostcrab-skills/openclaw/scenarios/](../ghostcrab-skills/openclaw/scenarios/)

Keep `openclaw/` and `shared/` as siblings so relative links in the skill keep working.

## When to use `openclaw mcp serve`

Do not use `openclaw mcp serve` to expose GhostCrab. That mode exposes OpenClaw conversations to another MCP client. It is useful when Codex, Claude Code, Gemini CLI, or another MCP client should talk to OpenClaw as the server.
