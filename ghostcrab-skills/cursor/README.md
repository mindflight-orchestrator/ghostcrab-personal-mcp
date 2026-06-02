# GhostCrab — Cursor integration

## MCP (connect the server)

To register the GhostCrab stdio server in Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`), use the product repo guide:

- [../../README_CURSOR_MCP.md](../../README_CURSOR_MCP.md)

## Rules

For agent rules, copy or symlink the relevant files into your project `.cursor/rules/` directory, or merge their contents into existing rules:

- `rules/ghostcrab-memory.mdc`
- `rules/ghostcrab-prompt-guide.mdc`
- `rules/ghostcrab-data-architect.mdc`
- `rules/ghostcrab-integration-sop-editor.mdc`
- `rules/mindbrain-comparison-writer.mdc`

Canonical onboarding and gates: [../shared/ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).

Composer 2.5 is treated as the lower-capability target here, so the Cursor rules are intentionally more literal and procedural than the Codex or Claude Code skills.

Claude Code users should use [../claude-code/README.md](../claude-code/README.md) instead.
