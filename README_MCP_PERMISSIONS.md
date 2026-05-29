# GhostCrab MCP permissions and IDE skill bundles

GhostCrab setup registers the MCP server, applies **MCP tool permission presets**, and installs a **complete IDE skill bundle** (rules, shared contracts, hooks).

## Quick start

```bash
# Default: MCP + permissions basic (14 tools) + skill bundle
npx gcp brain setup cursor
npx gcp brain setup claude --scope project
npx gcp brain setup codex

# Opt out
npx gcp brain setup cursor --no-permissions --no-skills
```

## Permission presets

| Preset | Behavior |
|--------|----------|
| `basic` (default) | Auto-approve the 14 recommended GhostCrab tools |
| `none` | No permission rules (`--no-permissions`) |
| `all` | Auto-approve every tool on the server |
| `read` | Allow read/bootstrap/guide/session; ask on write/model |
| `balanced` | Allow non-destructive tools; ask on delete/reset/ddl |
| `custom` | `--permissions-tool` / `--permissions-ask-tool` |

### Client mapping

| Client | File | Syntax |
|--------|------|--------|
| Claude Code | `.claude/settings.json` or `~/.claude/settings.json` | `mcp__<server>__<tool>` |
| Cursor | `~/.cursor/permissions.json` | `mcpAllowlist`: `<server>:<tool>` |

Server name default: **`ghostcrab-personal-mcp`** (must match `claude mcp list` / `mcp.json`).

## Permissions CLI

```bash
gcp brain permissions print --preset basic --client all
gcp brain permissions apply --preset balanced --client cursor --force
```

## IDE skill bundles (`bin/ide-skills`)

Authoring source: [`ghostcrab-skills/`](ghostcrab-skills/). Shipped install bundles: [`bin/ide-skills/`](bin/ide-skills/) (regenerate with `pnpm run sync:ide-skills`).

| Setup target | Installed into project |
|--------------|------------------------|
| `cursor` | `.cursor/rules/ghostcrab-memory.mdc`, `.ghostcrab/skills/shared/` |
| `claude` | `.ghostcrab/claude-self-memory.md`, `.ghostcrab/skills/shared/`, merge `.claude/settings.json` |
| `codex` | `.codex/skills/ghostcrab-memory/`, `.codex/skills/ghostcrab-shared/` |

Shared docs include `ONBOARDING_CONTRACT.md` so skills work **without** a checkout of `ghostcrab-skills/` in the user repo.

## Security notes

- Prefer **`basic`** over **`all`** in normal development.
- Cursor has no native `ask` tier — destructive tools are simply omitted from `basic`.
- Permission rules are enforced by the IDE runtime, not by the model. See [Claude Code permissions](https://code.claude.com/docs/en/permissions) and [Cursor permissions.json](https://cursor.com/docs/reference/permissions).

## Related docs

- [README_CURSOR_MCP.md](README_CURSOR_MCP.md)
- [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md)
- [README_CODEX_MCP.md](README_CODEX_MCP.md)
- [installations/gcp-brain-setup.md](installations/gcp-brain-setup.md)
- [bin/ide-skills/README.md](bin/ide-skills/README.md)
