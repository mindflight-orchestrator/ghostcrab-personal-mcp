# GhostCrab README template

> **Do not publish this file as product documentation.** It is a structural stub for drafting new GhostCrab docs. The canonical consumer guide is [README.md](README.md).

**Package:** `@mindflight/ghostcrab-personal-mcp` (current: **0.5.2**)  
**Engine:** MindBrain **1.7.1** (Zig, SQLite)  
**CLI:** `gcp` / `ghostcrab` — entrypoint `gcp brain up` (MCP stdio)

---

## Overview

One paragraph: GhostCrab MCP is the agent-facing interface to MindBrain — structured memory via facets, graph, and projections on SQLite (Personal) or PostgreSQL (Pro).

## Architecture (60 seconds)

```
IDE / Agent → MCP stdio → GhostCrab MCP (Node) → HTTP → MindBrain (Zig) → SQLite file
```

## Install (npmjs)

1. `npm install @mindflight/ghostcrab-personal-mcp@<version>`
2. `gcp authorize` if postinstall prompts
3. `gcp brain setup <cursor|claude|codex|generic>`
4. MCP host launches `gcp brain up`

Platform optional packages: `…-darwin-arm64`, `…-darwin-x64`, `…-linux-x64`, `…-linux-arm64`, `…-win32-x64`, `…-win32-arm64`.

## MCP surface

- Full catalog via `tools/list` (63 tools in v0.5.2)
- 13 recommended defaults; 50 extended — see `gcp tools list` / `docs/reference/mcp-tools.md`
- Operator CLI (`gcp brain structured-import`, `gcp brain document`, backup, setup) — not duplicated on MCP

## IDE guides

| Client | Doc |
| ------ | --- |
| Cursor | [README_CURSOR_MCP.md](README_CURSOR_MCP.md) |
| Claude Code | [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md) |
| Codex | [README_CODEX_MCP.md](README_CODEX_MCP.md) |
| Permissions + skills | [README_MCP_PERMISSIONS.md](README_MCP_PERMISSIONS.md) |
| macOS | [README_MACOSX.md](README_MACOSX.md) |

## Environment variables (common)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `GHOSTCRAB_SQLITE_PATH` | project `./data/ghostcrab.sqlite` or `~/.ghostcrab/databases/ghostcrab.sqlite` | SQLite file |
| `GHOSTCRAB_BACKEND_ADDR` | `:8091` | MindBrain listen address |
| `GHOSTCRAB_MINDBRAIN_URL` | `http://127.0.0.1:8091` | MCP → backend URL |
| `GHOSTCRAB_EMBEDDINGS_MODE` | `disabled` | BM25-only until configured |

Full list: [.env.example](.env.example)

## Further reading

- [INSTALL.md](INSTALL.md) — beta zip, git clone, pnpm quirks
- [docs/setup/gcp-client-setup.md](docs/setup/gcp-client-setup.md) — CLI reference
- [docs/reference/operator-catalog.md](docs/reference/operator-catalog.md) — MCP operator catalog
