# GhostCrab — Cursor integration

## MCP (connect the server)

To register the GhostCrab stdio server in Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`), use the product repo guide:

- [../../README_CURSOR_MCP.md](../../README_CURSOR_MCP.md)

## Skills

Run `gcp brain setup cursor` to install selectable GhostCrab skills globally under `~/.cursor/skills/`.

Canonical onboarding and gates: [../shared/ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).

Edit the common skill source under `../skills/<skill>/SKILL.md`. The local `skills/<skill>` paths are symlinks to that source, and `generated/cursor` points to the generated install bundle under `bin/ide-skills/cursor/skills/`.

Claude Code users should use [../claude-code/README.md](../claude-code/README.md) instead.
