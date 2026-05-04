# GhostCrab — Cursor integration

## MCP (connect the server)

To register the GhostCrab stdio server in Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`), use the product repo guide:

- [../../README_CURSOR_MCP.md](../../README_CURSOR_MCP.md)

## Rules and `CLAUDE.md`

Cursor picks up [CLAUDE.md](../../CLAUDE.md) at the product repo root. For **agent rules** (e.g. always-apply behavior), copy or symlink:

- `rules/ghostcrab-memory.mdc` → your project `.cursor/rules/` (or merge the contents into an existing rule file).

Canonical onboarding and gates: [../shared/ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).

Claude Code users should also use the repo root [CLAUDE.md](../../CLAUDE.md) pointer so the full skill stack loads.
