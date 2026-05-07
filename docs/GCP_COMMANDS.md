# `gcp` command reference (JTBD)

GhostCrab exposes a single CLI entry point, `gcp`. Commands are grouped by **job to be done**:

| Job | Command group | What it does |
|-----|----------------|--------------|
| **Start the brain + expose MCP** | `gcp brain up` | Launches the Zig MindBrain backend (if needed) and the MCP server on stdio. Shorthand: `gcp up` / `gcp start`. Legacy: `gcp serve`. |
| **Isolate memory (workspace)** | `gcp brain workspace create \| list` | Registers a named SQLite workspace. Legacy: `gcp init`. |
| **Structure in the DB (ontologies)** | `gcp brain schema …` | Registry ontologies (knowledge schema). Legacy: `gcp ontologies …`. |
| **Equip agents (skills)** | `gcp agent skills …` | Registry skills (agent capabilities). Shortcut: `gcp agent equip owner/name` = `agent skills pull`. Legacy: `gcp skills …`. |
| **CLI / MCP environment** | `gcp env …` | Read/write `~/.config/ghostcrab/config.json`. Legacy: `gcp config …`. |
| **Load demo profile** | `gcp brain load …` | JSONL profile into the DB. Legacy: `gcp load …`. |
| **Corpus import / profiling** | `gcp brain document …` | Normalize, profile, enqueue/worker, ingest (stop MCP first). See `gcp brain document --help`. |
| **Native binary permissions** | `gcp authorize` | `chmod` / macOS quarantine (also runs on `postinstall`). |
| **User-global MCP in IDE** | `gcp brain setup <cursor, codex, or claude> […]` | Registers the GhostCrab stdio server in the **user** scope: merges `~/.cursor/mcp.json` for Cursor, runs `codex mcp add` (or prints a TOML fragment) for Codex, or runs `claude mcp add` for Claude Code. Aliases: `gcp brain setup_cursor` / `setup_codex` / `setup_claude` / `setup_claudecode`. See [GCP_CLIENT_SETUP.md](./GCP_CLIENT_SETUP.md) and the root `README_*_MCP.md` files. |

## Why “brain” vs “agent”

- **Brain** = MindBrain / SQLite: persistence, workspaces, **what the data *is*** (schema / ontologies).
- **Agent** = what the MCP client can **do** with bundled skills (prompts, procedures) from the registry.

## MCP client `args` examples

```json
{ "command": "gcp", "args": ["brain", "up", "--workspace", "my-app"] }
```

```json
{ "command": "gcp", "args": ["up"] }
```

Legacy (still supported):

```json
{ "command": "gcp", "args": ["serve", "--workspace", "my-app"] }
```

## See also

- [skillset-demo-import.md](./skillset-demo-import.md) — bundle manifests, schema/skill pulls, vendored `skills install`, JSONL loads
- [GCP_CLIENT_SETUP.md](./GCP_CLIENT_SETUP.md) — IDE integration and env vars
- Root `README_CURSOR_MCP.md`, `README_CODEX_MCP.md`, `README_CLAUDE_CODE_MCP.md` — per-IDE MCP wiring
