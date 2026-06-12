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
| **Load demo into workspace** | `gcp brain workspace bootstrap` | Import a demo profile JSONL into a specific workspace with `--profile` or `--profile-file`, instead of loading into `profile_id` by default. |
| **Workspace destructive maintenance** | `ghostcrab workspace reset \| delete` | Lower-level launcher operations to wipe workspace-scoped data or remove/archive a workspace row; keep these out of normal agent flows. |
| **Schema packs (registry/cache)** | `gcp brain schema …` | Local or remote schema packs: `list`, `pull`, `show`, `remove`. Legacy alias: `gcp ontologies …`. |
| **Native ontology source import/export** | MCP `ghostcrab_ontology_import`; CLI `gcp brain ontology compile\|import\|export\|export-linkml\|inspect …` | Import LinkML or normalized OWL2/RDF N-Triples into MindBrain native `ontology_*` tables; inspect/export preserved N-Triples, taxonomy bundles, or LinkML slices. |
| **Equip agents (skills)** | `gcp agent skills …` | Registry skills (agent capabilities). Shortcut: `gcp agent equip owner/name` = `agent skills pull`. Legacy: `gcp skills …`. |
| **CLI / MCP environment** | `gcp env …` | Read/write `~/.ghostcrab/config.json`. Legacy: `gcp config …`. |
| **Host project bootstrap** | `gcp bootstrap` | Idempotently creates `.env`, `data/`, README doc symlinks, and the PATH shim in the current project. |
| **PATH shim** | `gcp path install\|print\|doctor` | Installs, prints, or diagnoses the cross-platform `~/.ghostcrab/bin/gcp` shim. |
| **MCP permissions** | `gcp brain permissions print\|apply` | Prints or writes Cursor/Claude MCP permission presets (`basic`, `balanced`, `full`, `none`, `custom`). |
| **Backup / restore** | `gcp brain backup …`, `gcp brain load …` | Export workspace, collection, or taxonomy backup bundles (includes `mindbrain_answer_artifacts` on full workspace export); restore `ghostcrab_backup_bundle` JSON. `gcp brain export` is an alias for backup. |
| **Answer artifact registry** | MCP `ghostcrab_projections_list`, `ghostcrab_artifact_get`, `ghostcrab_live_refresh`; CLI `gcp brain artifact list \| get \| refresh \| events \| migrate …` | MCP list includes registry + graph projection ids with routing hints ([projections-discovery.md](projections-discovery.md)); CLI list is registry-only via HTTP. |
| **Load demo profile** | `gcp brain load …` | JSONL profile into the DB. Legacy: `gcp load …`. |
| **Corpus import / profiling** | `gcp brain document …` | Normalize, profile, enqueue/worker, ingest, list qualification vocabulary (stop MCP first). See `gcp brain document --help` and [document-import.md](../setup/document-import.md). |
| **Tabular structured import** | `gcp brain structured-import …` | CSV/JSON/JSONL/JSON/YAML/XLSX/TOON via native engine and optional StarterKit bridge. `gcp brain structured-import kit` runs profiling + mapping validation + JSONL/CVS normalization and optional direct apply/reindex. See `gcp brain structured-import --help` and [structured-import.md](../setup/structured-import.md). |
| **Full import runbooks (Markdown)** | `gcp brain docs [structured\|document\|import]` | Prints packaged runbooks from `docs/setup/` (same content as the setup guides). |
| **Native binary permissions** | `gcp authorize` | `chmod` / macOS quarantine cleanup for native binaries (also runs on `postinstall`). |
| **Human DDL maintenance** | `gcp maintenance ddl-approve \| ddl-execute` | Explicit operator-only approval/execution for pending DDL migrations. Some launchers expose help at the subcommand level even if the group help is intentionally narrow. |
| **User-global MCP in IDE** | `gcp brain setup <cursor, codex, claude, or generic> […]` | Registers the GhostCrab stdio server where supported: merges `~/.cursor/mcp.json` for Cursor, runs `codex mcp add` (or prints TOML) for Codex, runs `claude mcp add` for Claude Code, or prints generic MCP JSON/TOML snippets. Also installs the matching GhostCrab skill bundle and `.ghostcrab/skills/installed.json`. Aliases: `gcp brain setup_cursor` / `setup_codex` / `setup_claude` / `setup_claudecode` / `setup_generic`. See [gcp-client-setup.md](../setup/gcp-client-setup.md) and [installations/gcp-brain-setup.md](../../installations/gcp-brain-setup.md). |

For the lower-level `ghostcrab`/`dist/index.js` launcher, the supported CLI
commands are intentionally narrow: `serve`, `smoke`, `status`, `tools list`,
`tools verify`, `maintenance ddl-approve|ddl-execute`, and destructive
`workspace reset|delete` maintenance. Commands like `search`, `remember`,
`upsert`, `schema`, `learn`, `project`, `pack`, and agent-driven ontology import are MCP-only.

## Answer artifact refresh

`gcp brain artifact refresh <artifact_id>` refreshes **one** live answer view by
exact registry id. The id must be a concrete `live_answer_view__...` value, for
example:

```bash
gcp brain artifact refresh live_answer_view__pilotage_hebdo
```

Wildcards and shell globs are not supported by the artifact API. A value like
`live_answer_view__serenity_*` is not expanded by `gcp` or by the MCP
`ghostcrab_live_refresh` tool; refresh many views by listing exact ids first and
calling refresh once per id:

```bash
gcp brain artifact list --workspace-id serenity --kind live_answer_view --limit 100 \
  | jq -r '.artifacts[].artifact_id' \
  | while read -r id; do gcp brain artifact refresh "$id"; done
```

MCP callers use the same rule: call `ghostcrab_live_refresh` once per exact
`artifact_id`.

The refresh endpoint is an HTTP `POST` route. If
`gcp brain artifact refresh live_answer_view__...` fails with
`405 MethodNotAllowed`, the usual cause is a stale running MindBrain backend
after an upgrade, or an operator hitting the URL with `GET`. Restart
`gcp brain up` / the MCP host so the current backend is serving, then retry with
one exact live view id. Missing ids should fail as missing artifacts, not as a
405.

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
- [installations/gcp-brain-setup.md](../installations/gcp-brain-setup.md) — IDE wiring via `gcp brain setup`
