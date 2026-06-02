# `gcp` command reference (JTBD)

GhostCrab exposes a single CLI entry point, `gcp`. Commands are grouped by **job to be done**:

The MCP server is the canonical product surface for memory and modeling actions
such as search, remember, upsert, schema registration, graph writes, projections,
and pack generation. The CLI is a local control plane: setup, environment,
startup, diagnostics/smoke checks, and explicit human maintenance actions.
GhostCrab code must call internal APIs or the backend client directly; it must
not shell out to its own CLI, SQLite, or MCP subprocesses to perform product
operations.

| Job | Command group | What it does |
|-----|----------------|--------------|
| **Start the brain + expose MCP** | `gcp brain up` | Launches the Zig MindBrain backend (if needed) and the MCP server on stdio. Shorthand: `gcp up` / `gcp start`. Legacy: `gcp serve`. |
| **Local smoke / diagnostics** | `gcp smoke`, `gcp status`, `gcp tools list` | Read-only checks for backend reachability, package/version, MCP tool registration, and operational status. |
| **Isolate memory (workspace)** | `gcp brain workspace create \| list` | Registers a named SQLite workspace. Legacy: `gcp init`. |
| **Structure in the DB (ontologies)** | `gcp brain schema …` | Registry ontologies (knowledge schema). Legacy: `gcp ontologies …`. |
| **Ontology source import/export** | `gcp brain ontology import\|export …` | Import normalized OWL2/RDF N-Triples into MindBrain, export preserved N-Triples or a taxonomy bundle. |
| **Equip agents (skills)** | `gcp agent skills …` | Registry skills (agent capabilities). Shortcut: `gcp agent equip owner/name` = `agent skills pull`. Legacy: `gcp skills …`. |
| **CLI / MCP environment** | `gcp env …` | Read/write `~/.config/ghostcrab/config.json`. Legacy: `gcp config …`. |
| **Backup / restore** | `gcp brain backup …`, `gcp brain load …` | Export workspace, collection, or taxonomy backup bundles; restore `ghostcrab_backup_bundle` JSON. `gcp brain export` is an alias for backup. |
| **Load demo profile** | `gcp brain load …` | JSONL profile into the DB. Legacy: `gcp load …`. |
| **Corpus import / profiling** | `gcp brain document …` | Normalize, profile, enqueue/worker, ingest, list qualification vocabulary (stop MCP first). See `gcp brain document --help` and [document-import.md](../setup/document-import.md). |
| **Tabular structured import** | `gcp brain structured-import …` | CSV/JSON/YAML/XLSX/TOON via native engine (stop MCP first). See `gcp brain structured-import --help` and [structured-import.md](../setup/structured-import.md). |
| **Full import runbooks (Markdown)** | `gcp brain docs [structured\|document\|import]` | Prints packaged runbooks from `docs/setup/` (same content as the setup guides). |
| **Native binary permissions** | `gcp authorize` | `chmod` / macOS quarantine (also runs on `postinstall`). |
| **Human DDL maintenance** | `gcp maintenance ddl-approve \| ddl-execute` | Explicit operator-only approval/execution for pending DDL migrations. |
| **User-global MCP in IDE** | `gcp brain setup <cursor, codex, claude, or generic> […]` | Registers the GhostCrab stdio server where supported: merges `~/.cursor/mcp.json` for Cursor, runs `codex mcp add` (or prints TOML) for Codex, runs `claude mcp add` for Claude Code, or prints generic MCP JSON/TOML snippets. Also installs the matching GhostCrab skill bundle and `.ghostcrab/skills/installed.json`. Aliases: `gcp brain setup_cursor` / `setup_codex` / `setup_claude` / `setup_claudecode` / `setup_generic`. See [gcp-client-setup.md](../setup/gcp-client-setup.md) and the root `README_*_MCP.md` files. |

For the lower-level `ghostcrab`/`dist/index.js` launcher, the supported CLI
commands are intentionally narrow: `serve`, `smoke`, `status`, `tools list`, and
`maintenance ddl-approve|ddl-execute`. Commands like `search`, `remember`,
`upsert`, `schema`, `learn`, `project`, and `pack` are MCP-only.

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

- [gcp-client-setup.md](../setup/gcp-client-setup.md) — IDE integration and env vars
- [document-import.md](../setup/document-import.md) — document normalization, deterministic import, LLM profiling, qualification vocabulary listing, and no-LLM fallbacks
- [skillset-demo-import.md](../setup/skillset-demo-import.md) — bundle manifests, schema/skill pulls, vendored `skills install`, JSONL loads
- [docs index](../index.md) — documentation entry point
- Root `README_CURSOR_MCP.md`, `README_CODEX_MCP.md`, `README_CLAUDE_CODE_MCP.md` — per-IDE MCP wiring
