# GhostCrab MCP permissions and IDE skill bundles

GhostCrab setup registers the MCP server, applies **MCP tool permission presets**, and installs a **complete IDE skill bundle** (10 skills + shared contracts).

**Release:** `@mindflight/ghostcrab-personal-mcp@0.5.2` · **13** recommended MCP tools · **63** total in `tools/list`

## Quick start

```bash
# Default: MCP + permissions basic (13 recommended tools) + 10-skill bundle
npx gcp brain setup cursor
npx gcp brain setup claude --scope project
npx gcp brain setup codex
npx gcp brain setup generic

# Opt out
npx gcp brain setup cursor --no-permissions --no-skills
```

## Permission presets

| Preset | Behavior |
|--------|----------|
| `basic` (default) | Auto-approve the 13 recommended GhostCrab tools |
| `none` | No permission rules (`--no-permissions`) |
| `all` | Auto-approve every tool on the server |
| `read` | Allow read/bootstrap/guide/session; ask on write/model |
| `balanced` | Allow non-destructive tools; ask on delete/reset/ddl |
| `custom` | `--permissions-tool` / `--permissions-ask-tool` |

Recommended tools in **`basic`**: `ghostcrab_status`, `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_combined_search`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_schema_get`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect`, `ghostcrab_pack`, `ghostcrab_project`, `ghostcrab_modeling_guidance`, `ghostcrab_tool_search`.

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

**Ten skills** (all hosts): ghostcrab-memory, ghostcrab-prompt-guide, ghostcrab-data-architect, ghostcrab-integration-sop-editor, mindbrain-comparison-writer, ghostcrab-operator, ghostcrab-evidence-discovery, ghostcrab-projection-reviewer, ghostcrab-gap-auditor, ghostcrab-json-answer-builder.

| Setup target | Installed by `gcp brain setup` |
|--------------|------------------------|
| `cursor` | `~/.cursor/skills/<skill>/`, `~/.cursor/skills/ghostcrab-shared/`, `.ghostcrab/skills/shared/` |
| `claude` | `.claude/skills/<skill>/`, `.claude/skills/ghostcrab-shared/`, `.ghostcrab/claude-self-memory.md`, `.ghostcrab/skills/shared/`, merge `.claude/settings.json` |
| `codex` | `~/.codex/skills/<skill>/`, `~/.codex/skills/ghostcrab-shared/`, `.ghostcrab/skills/shared/` |
| `generic` | `.agents/skills/<skill>/`, `.agents/skills/ghostcrab-shared/`, `.ghostcrab/skills/shared/`; prints MCP JSON/TOML snippets instead of writing client config |

Shared docs include `ONBOARDING_CONTRACT.md` so skills work **without** a checkout of `ghostcrab-skills/` in the user repo.

Every skills install also writes `.ghostcrab/skills/installed.json`, `.ghostcrab/skills/README.md`, and a best-effort `.ghostcrab/skills/current` shortcut (falling back to `.ghostcrab/skills/current.txt` when symlinks are unavailable).

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
