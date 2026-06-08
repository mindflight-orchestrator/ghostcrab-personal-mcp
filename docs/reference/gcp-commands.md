# `gcp` command reference (JTBD)

GhostCrab exposes a single CLI entry point, `gcp`. Commands are grouped by **job to be done**:

The MCP server is the canonical product surface for memory and modeling actions
such as search, remember, upsert, ontology import, schema registration, graph writes, projections,
and pack generation. The CLI is a local control plane: setup, environment,
startup, diagnostics/smoke checks, and explicit human maintenance actions.
GhostCrab code must call internal APIs or the backend client directly; it must
not shell out to its own CLI, SQLite, or MCP subprocesses to perform product
operations.

| Job | Command group | What it does |
|-----|----------------|--------------|
| **Start the brain + expose MCP** | `gcp brain up` | Launches the Zig MindBrain backend (if needed) and the MCP server on stdio. Shorthand: `gcp up` / `gcp start`. Legacy: `gcp serve`. |
| **Local smoke / diagnostics** | `gcp smoke`, `gcp status`, `gcp tools list`, `gcp tools verify` | Read-only checks for backend reachability, package/version, MCP tool registration, catalog drift, and operational status. |
| **SQLite lock inspection** | `gcp brain db-who [--path \| --workspace]` | Lists host processes holding the resolved GhostCrab SQLite file open via `lsof`. |
| **Isolate memory (workspace)** | `gcp brain workspace create \| list` | Registers or lists logical MindBrain `workspace_id` partitions. Legacy: `gcp init`. |
| **Workspace destructive maintenance** | `ghostcrab workspace reset \| delete` | Lower-level launcher operations to wipe workspace-scoped data or remove/archive a workspace row; keep these out of normal agent flows. |
| **Schema packs (registry/cache)** | `gcp brain schema …` | Local or remote schema packs: `list`, `pull`, `show`, `remove`. Legacy alias: `gcp ontologies …`. |
| **Native ontology source import/export** | MCP `ghostcrab_ontology_import`; CLI `gcp brain ontology compile\|import\|export\|export-linkml\|inspect …` | Import LinkML or normalized OWL2/RDF N-Triples into MindBrain native `ontology_*` tables; inspect/export preserved N-Triples, taxonomy bundles, or LinkML slices. |
| **Equip agents (skills)** | `gcp agent skills …` | Registry skills (agent capabilities). Shortcut: `gcp agent equip owner/name` = `agent skills pull`. Legacy: `gcp skills …`. |
| **CLI / MCP environment** | `gcp env …` | Read/write `~/.ghostcrab/config.json`. Legacy: `gcp config …`. |
| **Host project bootstrap** | `gcp bootstrap` | Idempotently creates `.env`, `data/`, README doc symlinks, and the PATH shim in the current project. |
| **PATH shim** | `gcp path install\|print\|doctor` | Installs, prints, or diagnoses the cross-platform `~/.ghostcrab/bin/gcp` shim. |
| **MCP permissions** | `gcp brain permissions print\|apply` | Prints or writes Cursor/Claude MCP permission presets (`basic`, `balanced`, `full`, `none`, `custom`). |
| **Backup / restore** | `gcp brain backup …`, `gcp brain load …` | Export workspace, collection, or taxonomy backup bundles (includes `mindbrain_answer_artifacts` on full workspace export); restore `ghostcrab_backup_bundle` JSON. `gcp brain export` is an alias for backup. |
| **Answer artifact registry** | `gcp brain artifact list \| get \| refresh \| events \| migrate …` | List/get/refresh/events via HTTP (backend running); backfill from legacy projections with `migrate --dry-run` / `--repair` (stop MCP first). |
| **Load demo profile** | `gcp brain load …` | JSONL profile into the DB. Legacy: `gcp load …`. |
| **Corpus import / profiling** | `gcp brain document …` | Normalize, profile, enqueue/worker, ingest, list qualification vocabulary (stop MCP first). See `gcp brain document --help` and [document-import.md](../setup/document-import.md). |
| **Tabular structured import** | `gcp brain structured-import …` | CSV/JSON/YAML/XLSX/TOON via native engine (stop MCP first). See `gcp brain structured-import --help` and [structured-import.md](../setup/structured-import.md). |
| **Full import runbooks (Markdown)** | `gcp brain docs [structured\|document\|import]` | Prints packaged runbooks from `docs/setup/` (same content as the setup guides). |
| **Native binary permissions** | `gcp authorize` | `chmod` / macOS quarantine cleanup for native binaries (also runs on `postinstall`). |
| **Human DDL maintenance** | `gcp maintenance ddl-approve \| ddl-execute` | Explicit operator-only approval/execution for pending DDL migrations. Some launchers expose help at the subcommand level even if the group help is intentionally narrow. |
| **User-global MCP in IDE** | `gcp brain setup <cursor, codex, claude, or generic> […]` | Registers the GhostCrab stdio server where supported: merges `~/.cursor/mcp.json` for Cursor, runs `codex mcp add` (or prints TOML) for Codex, runs `claude mcp add` for Claude Code, or prints generic MCP JSON/TOML snippets. Also installs the matching GhostCrab skill bundle and `.ghostcrab/skills/installed.json`. Aliases: `gcp brain setup_cursor` / `setup_codex` / `setup_claude` / `setup_claudecode` / `setup_generic`. See [gcp-client-setup.md](../setup/gcp-client-setup.md) and the root `README_*_MCP.md` files. |

For the lower-level `ghostcrab`/`dist/index.js` launcher, the supported CLI
commands are intentionally narrow: `serve`, `smoke`, `status`, `tools list`,
`tools verify`, `maintenance ddl-approve|ddl-execute`, and destructive
`workspace reset|delete` maintenance. Commands like `search`, `remember`,
`upsert`, `schema`, `learn`, `project`, `pack`, and agent-driven ontology import are MCP-only.

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

- [operator-catalog.md](operator-catalog.md) — full `gcp` and MCP tool list with SQLite impact (generated catalog)
- [mcp-tools.md](mcp-tools.md) — generated MCP tool API reference from the compiled registry
- [api-reference-blindspots.md](api-reference-blindspots.md) — coverage limits and stale-reference audit notes
- [gcp-client-setup.md](../setup/gcp-client-setup.md) — IDE integration and env vars
- [document-import.md](../setup/document-import.md) — document normalization, deterministic import, LLM profiling, qualification vocabulary listing, and no-LLM fallbacks
- [skillset-demo-import.md](../setup/skillset-demo-import.md) — bundle manifests, schema/skill pulls, vendored `skills install`, JSONL loads
- [docs index](../index.md) — documentation entry point
- Root `README_CURSOR_MCP.md`, `README_CODEX_MCP.md`, `README_CLAUDE_CODE_MCP.md` — per-IDE MCP wiring
