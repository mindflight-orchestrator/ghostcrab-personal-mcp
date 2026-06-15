# GhostCrab + Codex

This guide is the dedicated entry point for running **GhostCrab** with **OpenAI Codex**: MCP server wiring, optional environment, and how to install the skill mirrors in this folder.

For how `ghostcrab-skills` relates to the product repo, see [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md). For launcher details (`gcp`, `ghostcrab`) and other clients, see the product doc [gcp-client-setup.md](../../docs/setup/gcp-client-setup.md).

## Prerequisites

- **Node.js** 20+ and a package runner (`pnpm` or `npm`).
- **GhostCrab MCP** available as a local install, global CLI, or via `pnpm dlx` / `npx` (no global install).

Published package for this SQLite distribution: `@mindflight/ghostcrab-personal-mcp` (binaries: `gcp`, `ghostcrab`). MCP clients should invoke **`gcp brain up`** or legacy **`gcp serve`**, optionally with `--workspace <id>` to pin a logical MindBrain workspace_id. See the product [gcp-commands.md](../../docs/reference/gcp-commands.md).

Initialize a workspace once if you use a named workspace:

```bash
gcp brain workspace create my-project
# legacy: gcp init my-project
```

## Part 1 — Register the MCP server in Codex

Codex CLI can load MCP servers from the **CLI** or from **`config.toml`**. It does **not** consume Cursor-style JSON `mcpServers` blocks. Official reference: [Model Context Protocol – Codex](https://developers.openai.com/codex/mcp) and [Configuration Reference](https://developers.openai.com/codex/config-reference).

### Option A — CLI

With `gcp` on your `PATH`:

```bash
codex mcp add ghostcrab -- gcp brain up --workspace my-project
```

Without a global install:

```bash
codex mcp add ghostcrab -- pnpm dlx @mindflight/ghostcrab-personal-mcp@latest gcp brain up --workspace my-project
```

### Option B — `~/.codex/config.toml` or `.codex/config.toml`

Project-level `.codex/config.toml` is only honored for **trusted** projects (see Codex config docs).

**Global `gcp`:**

```toml
[mcp_servers.ghostcrab]
command = "gcp"
args = ["brain", "up", "--workspace", "my-project"]
```

**No global install:**

```toml
[mcp_servers.ghostcrab]
command = "pnpm"
args = ["dlx", "@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up", "--workspace", "my-project"]
```

**Optional environment** (SQLite path, backend URL, embeddings mode, etc.):

```toml
[mcp_servers.ghostcrab.env]
GHOSTCRAB_SQLITE_PATH = "/absolute/path/to/your/ghostcrab.sqlite"
```

**Pass through shell variables:**

```toml
[mcp_servers.ghostcrab]
command = "gcp"
args = ["brain", "up", "--workspace", "my-project"]
env_vars = ["GHOSTCRAB_SQLITE_PATH", "OPENROUTER_API_KEY"]
```

**SQLite path:** if you do not pass `--db`, GhostCrab uses `~/.ghostcrab/databases/ghostcrab.sqlite`. Use `--db <path>` or `GHOSTCRAB_SQLITE_PATH` for a project-local database.

```toml
[mcp_servers.ghostcrab]
command = "gcp"
args = ["brain", "up", "--workspace", "my-project"]
cwd = "/absolute/path/to/project"
```

Optional tuning (timeouts, enabled tools) matches Codex’s documented keys: `enabled`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`, etc.

### Verify

```bash
codex mcp list
codex
```

In the Codex TUI, run:

```text
/mcp
```

You should see **`ghostcrab`** (or the server name you chose) listed.

If the server is listed but no tools appear in chat, start a new Codex session and check `/mcp`. A registered server is only config; tools become available after Codex starts the MCP stdio process successfully for that session. If you used project `.codex/config.toml`, the project must be trusted.

## Part 2 — Install the Codex skill mirrors

**Canonical install:**

```bash
gcp brain setup codex --yes
```

This installs the same ten skills as Cursor and Claude Code, plus shared contracts under `~/.codex/skills/ghostcrab-shared/`.

This directory contains ten skills:

| Folder                                                                 | Role                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [ghostcrab-memory/](ghostcrab-memory/)                                 | Durable working memory, onboarding, long-running work                             |
| [ghostcrab-prompt-guide/](ghostcrab-prompt-guide/)                     | Prompt and workflow guidance aligned with GhostCrab                               |
| [ghostcrab-data-architect/](ghostcrab-data-architect/)                 | Structured domain modeling patterns                                               |
| [ghostcrab-integration-sop-editor/](ghostcrab-integration-sop-editor/) | Cleanup and introduction rewrites for GhostCrab/MindBrain integration SOP exports |
| [mindbrain-comparison-writer/](mindbrain-comparison-writer/)           | Editorial workflow for MindBrain comparison articles                              |
| [ghostcrab-operator/](ghostcrab-operator/)                             | Business questions → GhostCrab MCP workflows (Personal SQLite)                    |
| [ghostcrab-evidence-discovery/](ghostcrab-evidence-discovery/)         | Map business questions to facets, graph, projections via MCP                      |
| [ghostcrab-gap-auditor/](ghostcrab-gap-auditor/)                       | Audit gaps between questions and available MCP evidence                           |
| [ghostcrab-json-answer-builder/](ghostcrab-json-answer-builder/)       | Stable JSON answers from MCP outputs (observed vs inferred vs missing)            |
| [ghostcrab-projection-reviewer/](ghostcrab-projection-reviewer/)       | Review Type A/B projections and readiness via MCP                                 |

Each skill’s `SKILL.md` links to shared contracts under **`../ghostcrab-shared/`** after install (for example `ONBOARDING_CONTRACT.md`, `ARTIFACT_KINDS.md`, `RUNTIME_QUERY_PIPELINE.md`). In this authoring repo, the source stubs live under `../shared/`.

Each skill is **autonomous** at runtime: workflows and guardrails are inline in `SKILL.md`. Operational skills may optionally reference starter-kit delivery SOPs — resolve paths via [STARTERKIT_PATHS.md](../shared/STARTERKIT_PATHS.md) (`{starterkit}/personal-mcp/SOP_SEQUENCE.md`) when you run a phased import project.

**Recommended:** use `gcp brain setup codex` rather than manual symlinks. For manual installs, preserve `codex/skills/` and `ghostcrab-shared/` as siblings under your Codex skills root so relative links keep working.

## Part 3 — Shared rules of the road

- **First fuzzy onboarding** is **intake-only**: follow [ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md) in full.
- **Product language first** in skills; avoid leading with low-level mechanics unless the user asks.
- **Demo data** (optional): portable profiles live under [shared/demo-profiles/](../shared/demo-profiles/); loading them uses product-side tooling, not Codex itself.
- **Project artifacts**: use the GhostCrab Personal StarterKit for clonable SOPs and templates — resolve paths via [STARTERKIT_PATHS.md](../shared/STARTERKIT_PATHS.md).

## See also

- [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md) — repo split, validation, versioning
- [gcp-client-setup.md](../../docs/setup/gcp-client-setup.md) — `gcp` commands, Cursor, Claude Code, local packs
- [openclaw/README.md](../openclaw/README.md) — same integration pattern for OpenClaw
- [ghostcrab-skills README.md](../README.md) — full layout and validation commands
